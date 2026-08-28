import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import {
  LeaveType,
  LeavePolicy,
  LeaveBalance,
  LeaveBalanceTemplate,
  LeaveRequest,
  LeaveApproval,
  LeaveApprovalAssignment,
  LeaveWorkflowConfig,
  Holiday,
  EmployeeLeaveLimitEntity,
} from './entities';
import { Employee } from '../employee/entities/employee.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { CreateLeaveAssignmentDto } from './dto/create-leave-assignment.dto';
import { InitializeBalanceDto } from './dto/initialize-balance.dto';
import { SetLeaveBalanceTemplatesDto } from './dto/set-leave-balance-templates.dto';
import {
  SetEmployeeLeaveLimitDto,
  UpdateEmployeeLeaveLimitDto,
} from './dto/set-employee-leave-limit.dto';
import { MessageGateway } from '../message/message.gateway';
import { MessageService } from '../message/message.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveType) private leaveTypeRepo: Repository<LeaveType>,
    @InjectRepository(LeavePolicy) private policyRepo: Repository<LeavePolicy>,
    @InjectRepository(LeaveBalance)
    private balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(LeaveBalanceTemplate)
    private templateRepo: Repository<LeaveBalanceTemplate>,
    @InjectRepository(LeaveRequest)
    private requestRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveApproval)
    private approvalRepo: Repository<LeaveApproval>,
    @InjectRepository(LeaveApprovalAssignment)
    private assignmentRepo: Repository<LeaveApprovalAssignment>,
    @InjectRepository(LeaveWorkflowConfig)
    private workflowRepo: Repository<LeaveWorkflowConfig>,
    @InjectRepository(Holiday) private holidayRepo: Repository<Holiday>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(EmployeeLeaveLimitEntity)
    private employeeLeaveLimitRepo: Repository<EmployeeLeaveLimitEntity>,
    private messageGateway: MessageGateway,
    private messageService: MessageService,
    private mailService: MailService,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  // ─── Leave Types ───

  async getLeaveTypes(orgId: string, gender?: string): Promise<LeaveType[]> {
    const all = await this.leaveTypeRepo.find({
      where: { organization: { id: orgId } },
    });
    if (!gender) return all;
    // Filter out types that are restricted to a different gender
    return all.filter(
      (lt) =>
        !lt.genderRestriction ||
        lt.genderRestriction.toLowerCase() === gender.toLowerCase(),
    );
  }

  async createLeaveType(dto: CreateLeaveTypeDto): Promise<LeaveType> {
    const leaveType = this.leaveTypeRepo.create({
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive ?? true,
      organization: { id: dto.organizationId },
      genderRestriction: dto.genderRestriction ?? null,
      isEarned: dto.isEarned ?? false,
    });
    return this.leaveTypeRepo.save(leaveType);
  }

  async updateLeaveType(
    id: string,
    dto: UpdateLeaveTypeDto,
  ): Promise<LeaveType> {
    const leaveType = await this.leaveTypeRepo.findOne({ where: { id } });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    Object.assign(leaveType, dto);
    return this.leaveTypeRepo.save(leaveType);
  }

  async deleteLeaveType(id: string): Promise<void> {
    const result = await this.leaveTypeRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Leave type not found');
    }
  }

  // ─── Leave Balance ───

  async getLeaveBalance(userId: string): Promise<LeaveBalance[]> {
    const balances = await this.balanceRepo.find({
      where: { user: { id: userId } },
      relations: ['leaveType'],
    });

    // Get employee gender to filter out gender-restricted leave types
    const employee = await this.employeeRepo.findOne({ where: { userId } });
    const gender = employee?.gender?.toLowerCase() ?? null;

    return balances.filter((b) => {
      const restriction = b.leaveType?.genderRestriction?.toLowerCase();
      if (!restriction) return true; // no restriction
      if (!gender) return false; // employee gender unknown, hide restricted types
      return restriction === gender;
    });
  }

  async initializeLeaveBalance(
    dto: InitializeBalanceDto,
  ): Promise<LeaveBalance> {
    // Manual balance edit: serialize with a pessimistic row lock inside a
    // transaction so two admins editing the same balance at once cannot
    // silently overwrite each other's change. The row becomes the single
    // authority for the read-modify-write; the second editor waits, then
    // recomputes against the committed values.
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(LeaveBalance, {
        where: { user: { id: dto.userId }, leaveType: { id: dto.leaveTypeId } },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        existing.openingBalance = dto.openingBalance;
        existing.closingBalance =
          dto.openingBalance +
          existing.accrued -
          existing.consumed +
          existing.carriedForward -
          existing.encashed;
        return manager.save(existing);
      }

      // Still inside the transaction: the (user, leaveType) unique index
      // backstops the create race — only one concurrent delete-then-create
      // wins; the loser surfaces a unique conflict instead of a silent
      // lost update.
      return manager.save(
        manager.create(LeaveBalance, {
          user: { id: dto.userId } as any,
          leaveType: { id: dto.leaveTypeId } as any,
          openingBalance: dto.openingBalance,
          closingBalance: dto.openingBalance,
        }),
      );
    });
  }

  // ─── Credit Earned Leave ───

  async creditEarnedLeave(
    userId: string,
    days: number,
    organizationId: string,
  ): Promise<LeaveBalance> {
    // Find the org's earned leave type
    const earnedType = await this.leaveTypeRepo.findOne({
      where: {
        organization: { id: organizationId },
        isEarned: true,
        isActive: true,
      },
    });
    if (!earnedType) {
      throw new NotFoundException(
        'No earned leave type configured for this organization',
      );
    }

    // The earned-leave credit is a source-of-truth balance operation, so it must
    // not lose an update if two credits for the same user arrive concurrently.
    // Serialize with a pessimistic row lock inside a transaction (matches the
    // pattern used in the approval flows); the unique (user, leaveType) index
    // backstops the create race. NotFoundException above left untouched.
    return this.dataSource.transaction(async (manager) => {
      let balance = await manager.findOne(LeaveBalance, {
        where: { user: { id: userId }, leaveType: { id: earnedType.id } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        balance = manager.create(LeaveBalance, {
          user: { id: userId },
          leaveType: earnedType,
          openingBalance: 0,
          accrued: 0,
          consumed: 0,
          carriedForward: 0,
          encashed: 0,
          closingBalance: 0,
        });
      }

      balance.accrued += days;
      balance.closingBalance += days;
      return manager.save(balance);
    });
  }

  // ─── Leave Balance Templates ───

  async setLeaveBalanceTemplates(dto: SetLeaveBalanceTemplatesDto) {
    const results: LeaveBalanceTemplate[] = [];
    for (const item of dto.items) {
      const existing = await this.templateRepo.findOne({
        where: {
          organization: { id: dto.organizationId },
          employmentType: dto.employmentType,
          leaveType: { id: item.leaveTypeId },
        },
      });

      if (existing) {
        existing.openingBalance = item.openingBalance;
        results.push(await this.templateRepo.save(existing));
      } else {
        const created = this.templateRepo.create({
          organization: { id: dto.organizationId },
          employmentType: dto.employmentType,
          leaveType: { id: item.leaveTypeId },
          openingBalance: item.openingBalance,
        });
        results.push(await this.templateRepo.save(created));
      }
    }
    return results;
  }

  async getLeaveBalanceTemplates(
    organizationId: string,
    employmentType?: string,
  ) {
    const where: any = { organization: { id: organizationId } };
    if (employmentType) {
      where.employmentType = employmentType;
    }
    return this.templateRepo.find({
      where,
      relations: ['leaveType'],
      order: { employmentType: 'ASC' },
    });
  }

  async applyTemplatesToUser(
    userId: string,
    organizationId: string,
    employmentType: string,
  ) {
    if (!employmentType) return;
    const templates = await this.templateRepo.find({
      where: {
        organization: { id: organizationId },
        employmentType,
      },
      relations: ['leaveType'],
    });

    const employee = await this.employeeRepo.findOne({ where: { userId } });
    const gender = employee?.gender?.toLowerCase() ?? null;

    for (const t of templates) {
      const restriction = t.leaveType?.genderRestriction?.toLowerCase();
      if (restriction && restriction !== gender) continue; // skip gender-restricted type
      await this.initializeLeaveBalance({
        userId,
        leaveTypeId: t.leaveType.id,
        openingBalance: t.openingBalance,
      });
    }
  }

  async rolloverOrganizationBalances(
    organizationId: string,
    carryForwardEnabled: boolean,
  ): Promise<{ updated: number }> {
    const employees = await this.employeeRepo.find({
      where: { organizationId },
      select: ['userId', 'employmentType'],
    });
    if (!employees.length) return { updated: 0 };

    const templates = await this.templateRepo.find({
      where: { organization: { id: organizationId } },
      relations: ['leaveType'],
    });
    if (!templates.length) return { updated: 0 };

    const templatesByEmploymentType = templates.reduce(
      (acc, t) => {
        const key = t.employmentType || '';
        if (!acc[key]) acc[key] = [];
        acc[key].push(t);
        return acc;
      },
      {} as Record<string, LeaveBalanceTemplate[]>,
    );

    let updated = 0;

    for (const emp of employees) {
      const empType = emp.employmentType || '';
      const empTemplates = templatesByEmploymentType[empType] || [];
      for (const template of empTemplates) {
        // Per-row transaction + pessimistic lock: two admins running a
        // rollover at once cannot clobber each other's carry-forward recompute
        // or silently overwrite one another's balance values.
        await this.dataSource.transaction(async (manager) => {
          const existing = await manager.findOne(LeaveBalance, {
            where: {
              user: { id: emp.userId },
              leaveType: { id: template.leaveType.id },
            },
            lock: { mode: 'pessimistic_write' },
          });

          const carry = carryForwardEnabled
            ? Math.max(0, Number(existing?.closingBalance ?? 0))
            : 0;
          const opening = Number(template.openingBalance || 0) + carry;

          if (existing) {
            existing.openingBalance = opening;
            existing.carriedForward = carry;
            existing.accrued = 0;
            existing.consumed = 0;
            existing.encashed = 0;
            existing.closingBalance = opening;
            await manager.save(existing);
          } else {
            await manager.save(
              manager.create(LeaveBalance, {
                user: { id: emp.userId } as any,
                leaveType: { id: template.leaveType.id } as any,
                openingBalance: opening,
                carriedForward: carry,
                accrued: 0,
                consumed: 0,
                encashed: 0,
                closingBalance: opening,
              }),
            );
          }
        });
        updated += 1;
      }
    }

    return { updated };
  }

  // ─── Leave Application ───

  async applyForLeave(
    userId: string,
    leaveTypeId: string,
    startDate: string,
    endDate: string,
    reason: string,
  ) {
    const leaveType = await this.leaveTypeRepo.findOne({
      where: { id: leaveTypeId },
    });
    if (!leaveType) throw new NotFoundException('Invalid leave type');

    const numberOfDays = this.calculateBusinessDays(startDate, endDate);
    const limitCheck = await this.checkLeaveLimit(
      userId,
      leaveTypeId,
      numberOfDays,
      startDate,
    );
    if (!limitCheck.allowed) {
      throw new BadRequestException(
        limitCheck.reason || 'Leave limit reached for this request',
      );
    }
    const paidDays = Math.max(0, Number(limitCheck.paidDays ?? numberOfDays));
    const unpaidDays = Math.max(0, Number(limitCheck.unpaidDays ?? 0));
    let balance = await this.balanceRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: leaveTypeId } },
    });

    // Allow leave applications even when balance is exhausted (unpaid/negative flow).
    // If no balance row exists yet, create one at zero so approval can deduct into minus.
    if (!balance) {
      balance = await this.balanceRepo.save(
        this.balanceRepo.create({
          user: { id: userId } as any,
          leaveType: { id: leaveTypeId } as any,
          openingBalance: 0,
          accrued: 0,
          consumed: 0,
          carriedForward: 0,
          encashed: 0,
          closingBalance: 0,
        }),
      );
    }

    const request = await this.requestRepo.save({
      user: { id: userId },
      leaveType: { id: leaveTypeId },
      startDate,
      endDate,
      numberOfDays,
      paidDays,
      unpaidDays,
      reason,
      status: 'PENDING',
    });

    const approvers = await this.assignmentRepo.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['approver'],
      order: { level: 'ASC' },
    });

    let approvalEntities: LeaveApproval[] = [];

    if (approvers.length) {
      approvalEntities = approvers.map((a) =>
        this.approvalRepo.create({
          leaveRequest: request,
          approver: a.approver,
          level: a.level,
          status: a.level === 1 ? 'PENDING' : 'WAITING',
        }),
      );
    } else {
      // Fallback: Manager -> Admin
      const employee = await this.employeeRepo.findOne({
        where: { userId },
      });

      const fallbackApprovers: { approverId: string; level: number }[] = [];

      if (employee?.reportingTo) {
        const manager = await this.employeeRepo.findOne({
          where: { id: employee.reportingTo },
        });
        if (manager?.userId) {
          fallbackApprovers.push({ approverId: manager.userId, level: 1 });
        }
      }

      const orgId = employee?.organizationId;
      if (orgId) {
        const hrUserId = await this.findHrUserIdInOrg(
          orgId,
          employee?.branchId,
        );
        if (hrUserId) {
          const already = fallbackApprovers.find(
            (a) => a.approverId === hrUserId,
          );
          if (!already) {
            fallbackApprovers.push({
              approverId: hrUserId,
              level: fallbackApprovers.length ? 2 : 1,
            });
          }
        }
      }

      if (!fallbackApprovers.length) {
        // No approvers found - still create the request so admin can approve directly
        // Request remains PENDING with no approval entities
        return request;
      }

      approvalEntities = fallbackApprovers.map((a) =>
        this.approvalRepo.create({
          leaveRequest: request,
          approver: { id: a.approverId } as any,
          level: a.level,
          status: a.level === 1 ? 'PENDING' : 'WAITING',
        }),
      );
      await this.approvalRepo.save(approvalEntities);

      // Notify level-1 approver via WebSocket
      const level1 = approvalEntities.find((a) => a.level === 1);
      if (level1?.approver) {
        this.messageGateway.emitToUser(level1.approver.id, {
          type: 'leave:new_request',
          message: 'New leave request received',
          requestId: request.id,
        });
      }
    }

    return request;
  }

  // ─── Leave Approval ───

  async approveOrRejectLeave(
    approverId: string,
    requestId: string,
    approve: boolean,
    remarks: string,
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['approvals', 'approvals.approver', 'user', 'leaveType'],
    });
    if (!request) throw new NotFoundException('Request not found');

    const adminRoleNames = ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN'];
    const adminUserRole = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'role')
      .where('ur.user_id = :userId', { userId: approverId })
      .andWhere('role.roleName IN (:...roles)', { roles: adminRoleNames })
      .andWhere('ur.isActive = true')
      .getOne();
    const isAdmin = Boolean(adminUserRole);

    if (isAdmin) {
      // Admin bypass: approve/reject all pending steps directly
      const now = new Date();

      // If there are approval entities, process them
      if (request.approvals && request.approvals.length > 0) {
        for (const ap of request.approvals) {
          if (ap.status === 'PENDING' || ap.status === 'WAITING') {
            ap.status = approve ? 'APPROVED' : 'REJECTED';
            ap.remarks = remarks;
            ap.actionAt = now;
          }
        }
        await this.approvalRepo.save(request.approvals);
      }

      if (!approve) {
        request.status = 'REJECTED';
        await this.requestRepo.save(request);
        this.messageGateway.emitToUser(request.user.id, {
          type: 'leave:rejected',
          message: 'Your leave request has been rejected',
          requestId: request.id,
        });
        await this.messageService.createMessage(approverId, {
          organizationId: request.user.organizationId,
          recipientUserIds: [request.user.id],
          title: 'Leave Rejected',
          body: 'Your leave request has been rejected.',
          type: 'leave',
        });
        if (request.user.email) {
          this.mailService
            .sendLeaveStatus(
              { email: request.user.email, firstName: request.user.firstName },
              'REJECTED',
              {
                leaveType: request.leaveType?.name ?? 'Leave',
                startDate: request.startDate,
                endDate: request.endDate,
                numberOfDays: request.numberOfDays,
                remarks,
              },
              request.user.organizationId,
            )
            .catch(() => undefined);
        }
        return { message: 'Leave rejected' };
      }

      // Deduct the leave balance AND mark the request as approved in ONE atomic,
      // pessimistically-locked step so that:
      //  - two concurrent submissions of the SAME approval cannot double-deduct
      //    (only a still-PENDING request is processed), and
      //  - approvals of DIFFERENT requests touching the SAME employee cannot
      //    overwrite each other's balance delta, and
      //  - an insufficient balance rolls the whole step back so the request is
      //    never left marked approved without a deduction.
      let acted = false;

      await this.dataSource.transaction(async (manager) => {
        const lockedReq = await manager.findOne(LeaveRequest, {
          where: { id: request.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedReq) throw new NotFoundException('Leave request not found');

        // Idempotency guard: if another actor already acted, do nothing.
        if (lockedReq.status !== 'PENDING') {
          return;
        }
        acted = true;

        // Best-effort deduction: if no balance row exists, skip (preserves the
        // existing "no balance → no deduction" business rule).
        const txnBalance = await manager.findOne(LeaveBalance, {
          where: {
            user: { id: request.user.id },
            leaveType: { id: request.leaveType.id },
          },
        });
        if (txnBalance) {
          const hasExplicitPaidSplit =
            Number(request.paidDays ?? 0) > 0 ||
            Number(request.unpaidDays ?? 0) > 0;
          const payableDays = hasExplicitPaidSplit
            ? Number(request.paidDays ?? 0)
            : Number(request.numberOfDays ?? 0);
          const daysToDeduct = Math.max(0, payableDays);
          if (daysToDeduct > 0) {
            const deducted = await manager
              .createQueryBuilder()
              .update(LeaveBalance)
              .set({
                consumed: () => `consumed + ${daysToDeduct}`,
                closingBalance: () => `closingBalance - ${daysToDeduct}`,
              })
              .where('id = :id AND closingBalance >= :daysToDeduct', {
                id: txnBalance.id,
                daysToDeduct,
              })
              .execute();
            if (deducted.affected === 0) {
              throw new BadRequestException(
                'Insufficient leave balance to approve this request.',
              );
            }
          }
        }

        await manager.update(
          LeaveRequest,
          { id: lockedReq.id },
          {
            status: 'APPROVED',
            approvedBy: { id: approverId } as any,
            approvedAt: now,
          },
        );
      });

      if (acted) {
        this.messageGateway.emitToUser(request.user.id, {
          type: 'leave:approved',
          message: 'Your leave request has been approved',
          requestId: request.id,
        });
        await this.messageService.createMessage(approverId, {
          organizationId: request.user.organizationId,
          recipientUserIds: [request.user.id],
          title: 'Leave Approved',
          body: 'Your leave request has been approved.',
          type: 'leave',
        });
        if (request.user.email) {
          this.mailService
            .sendLeaveStatus(
              { email: request.user.email, firstName: request.user.firstName },
              'APPROVED',
              {
                leaveType: request.leaveType?.name ?? 'Leave',
                startDate: request.startDate,
                endDate: request.endDate,
                numberOfDays: request.numberOfDays,
                remarks,
              },
              request.user.organizationId,
            )
            .catch(() => undefined);
        }
      }

      return { message: 'Leave approved' };
    }

    const currentApproval = request.approvals.find(
      (a) => a.approver.id === approverId && a.status === 'PENDING',
    );
    if (!currentApproval) {
      throw new ForbiddenException('Not authorized or already acted');
    }

    const userId = request.user.id;

    if (!approve) {
      // ── Rejection (unchanged behavior) ──
      currentApproval.status = 'REJECTED';
      currentApproval.remarks = remarks;
      currentApproval.actionAt = new Date();
      await this.approvalRepo.save(currentApproval);

      request.status = 'REJECTED';
      await this.requestRepo.save(request);

      this.messageGateway.emitToUser(userId, {
        type: 'leave:rejected',
        message: 'Your leave request has been rejected',
        requestId: request.id,
      });
      await this.messageService.createMessage(approverId, {
        organizationId: request.user.organizationId,
        recipientUserIds: [userId],
        title: 'Leave Rejected',
        body: 'Your leave request has been rejected.',
        type: 'leave',
      });
      if (request.user.email) {
        this.mailService
          .sendLeaveStatus(
            { email: request.user.email, firstName: request.user.firstName },
            'REJECTED',
            {
              leaveType: request.leaveType?.name ?? 'Leave',
              startDate: request.startDate,
              endDate: request.endDate,
              numberOfDays: request.numberOfDays,
              remarks,
            },
            request.user.organizationId,
          )
          .catch(() => undefined);
      }

      return { message: 'Leave rejected' };
    }

    const nextLevel = currentApproval.level + 1;
    const nextApproval = request.approvals.find((a) => a.level === nextLevel);

    if (nextApproval) {
      // ── Intermediate step: advance the workflow chain ──
      currentApproval.status = 'APPROVED';
      currentApproval.remarks = remarks;
      currentApproval.actionAt = new Date();
      await this.approvalRepo.save(currentApproval);

      nextApproval.status = 'PENDING';
      await this.approvalRepo.save(nextApproval);

      this.messageGateway.emitToUser(nextApproval.approver.id, {
        type: 'leave:pending_approval',
        message: 'Leave request awaiting your approval',
        requestId: request.id,
      });
    } else {
      // ── Final approval: settle atomically and idempotently ──
      // The pessimistic row lock on the approval row serializes concurrent
      // attempts on the SAME request: the loser waits, then sees the status is
      // no longer PENDING and backs out WITHOUT deducting twice. The balance is
      // consumed with an atomic guarded UPDATE so approvals of DIFFERENT
      // requests touching the SAME employee can never overwrite each other's
      // delta. If the balance is insufficient the whole transaction rolls back,
      // so the request is never left marked APPROVED without a deduction.
      let acted = false;

      await this.dataSource.transaction(async (manager) => {
        const lockedApproval = await manager.findOne(LeaveApproval, {
          where: { id: currentApproval.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedApproval || lockedApproval.status !== 'PENDING') {
          // Already acted on (a retry or a concurrent request) — do nothing.
          return;
        }

        acted = true;

        const hasExplicitPaidSplit =
          Number(request.paidDays ?? 0) > 0 ||
          Number(request.unpaidDays ?? 0) > 0;
        const payableDays = hasExplicitPaidSplit
          ? Number(request.paidDays ?? 0)
          : Number(request.numberOfDays ?? 0);
        const daysToDeduct = Math.max(0, payableDays);

        if (daysToDeduct > 0) {
          let txnBalance = await manager.findOne(LeaveBalance, {
            where: {
              user: { id: request.user.id },
              leaveType: { id: request.leaveType.id },
            },
          });

          if (!txnBalance) {
            txnBalance = await manager.save(
              manager.create(LeaveBalance, {
                user: { id: request.user.id } as any,
                leaveType: { id: request.leaveType.id } as any,
                openingBalance: 0,
                accrued: 0,
                carriedForward: 0,
                encashed: 0,
                consumed: 0,
                closingBalance: 0,
              }),
            );
          }

          const deducted = await manager
            .createQueryBuilder()
            .update(LeaveBalance)
            .set({
              consumed: () => `consumed + ${daysToDeduct}`,
              closingBalance: () => `closingBalance - ${daysToDeduct}`,
            })
            .where('id = :id AND closingBalance >= :daysToDeduct', {
              id: txnBalance.id,
              daysToDeduct,
            })
            .execute();

          if (deducted.affected === 0) {
            throw new BadRequestException(
              'Insufficient leave balance to approve this request.',
            );
          }
        }

        await manager.update(
          LeaveApproval,
          { id: lockedApproval.id },
          { status: 'APPROVED', remarks, actionAt: new Date() },
        );

        await manager.update(
          LeaveRequest,
          { id: request.id },
          {
            status: 'APPROVED',
            approvedBy: { id: approverId } as any,
            approvedAt: new Date(),
          },
        );
      });

      if (acted) {
        this.messageGateway.emitToUser(userId, {
          type: 'leave:approved',
          message: 'Your leave request has been approved',
          requestId: request.id,
        });
        await this.messageService.createMessage(approverId, {
          organizationId: request.user.organizationId,
          recipientUserIds: [userId],
          title: 'Leave Approved',
          body: 'Your leave request has been approved.',
          type: 'leave',
        });
        if (request.user.email) {
          this.mailService
            .sendLeaveStatus(
              { email: request.user.email, firstName: request.user.firstName },
              'APPROVED',
              {
                leaveType: request.leaveType?.name ?? 'Leave',
                startDate: request.startDate,
                endDate: request.endDate,
                numberOfDays: request.numberOfDays,
                remarks,
              },
              request.user.organizationId,
            )
            .catch(() => undefined);
        }
      }
    }

    return { message: 'Leave approved' };
  }

  // ─── Queries ───

  /**
   * `users.firstName/lastName` is the raw login identity and is often left
   * at its account-creation default (e.g. "Admin" for accounts created via
   * an admin invite). The `employees` table (HR profile, kept up to date
   * via the Employees admin form) is the accurate name source. Overlay it
   * onto each already-loaded `user` relation in place so every consumer —
   * admin requests table, manager approval screen, mobile app — shows the
   * real employee name without each having to separately cross-reference
   * the employees table itself.
   */
  private async overlayEmployeeNames(
    users: Array<
      | {
          id: string;
          firstName?: string;
          middleName?: string;
          lastName?: string;
        }
      | null
      | undefined
    >,
  ): Promise<void> {
    const userIds = [
      ...new Set(
        users
          .filter(
            (
              u,
            ): u is {
              id: string;
              firstName?: string;
              middleName?: string;
              lastName?: string;
            } => !!u,
          )
          .map((u) => u.id),
      ),
    ];
    if (userIds.length === 0) return;

    const employees = await this.employeeRepo
      .createQueryBuilder('employee')
      .where('employee.userId IN (:...userIds)', { userIds })
      .select([
        'employee.userId',
        'employee.firstName',
        'employee.middleName',
        'employee.lastName',
      ])
      .getMany();

    const nameByUserId = new Map(
      employees
        .filter((e) => e.firstName)
        .map((e) => [
          e.userId,
          {
            firstName: e.firstName,
            middleName: e.middleName,
            lastName: e.lastName,
          },
        ]),
    );

    for (const user of users) {
      if (!user) continue;
      const resolved = nameByUserId.get(user.id);
      if (resolved) {
        user.firstName = resolved.firstName;
        user.middleName = resolved.middleName;
        user.lastName = resolved.lastName;
      }
    }
  }

  async getPendingApprovalsForUser(userId: string): Promise<LeaveApproval[]> {
    const approvals = await this.approvalRepo.find({
      where: { approver: { id: userId }, status: 'PENDING' },
      relations: [
        'leaveRequest',
        'leaveRequest.user',
        'leaveRequest.leaveType',
      ],
    });
    await this.overlayEmployeeNames(approvals.map((a) => a.leaveRequest?.user));
    return approvals;
  }

  async getAllApprovalsForUser(approverId: string): Promise<LeaveApproval[]> {
    const approvals = await this.approvalRepo.find({
      where: { approver: { id: approverId } },
      relations: [
        'leaveRequest',
        'leaveRequest.user',
        'leaveRequest.leaveType',
      ],
      order: { actionAt: 'DESC' },
    });
    await this.overlayEmployeeNames(approvals.map((a) => a.leaveRequest?.user));
    return approvals;
  }

  async getLeaveRequestsByUser(userId: string): Promise<LeaveRequest[]> {
    const requests = await this.requestRepo.find({
      where: { user: { id: userId } },
      relations: ['leaveType', 'approvals', 'approvals.approver'],
      order: { createdAt: 'DESC' },
    });
    await this.overlayEmployeeNames(
      requests.flatMap((r) => r.approvals?.map((a) => a.approver) ?? []),
    );
    return requests;
  }

  async deleteLeaveRequestByUser(
    requestId: string,
    userId: string,
  ): Promise<void> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['user'],
    });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.user?.id !== userId) {
      throw new ForbiddenException(
        'You can only delete your own leave request',
      );
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        'Only pending leave requests can be deleted',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(`${request.startDate}T00:00:00`);
    if (startDate <= today) {
      throw new BadRequestException(
        'Leave request can only be deleted before the start date',
      );
    }

    await this.approvalRepo.delete({
      leaveRequest: { id: requestId } as LeaveRequest,
    });
    await this.requestRepo.delete(requestId);
  }

  async getLeaveRequestsByOrg(orgId: string): Promise<LeaveRequest[]> {
    const requests = await this.requestRepo
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.user', 'user')
      .leftJoinAndSelect('lr.leaveType', 'leaveType')
      .leftJoinAndSelect('lr.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approver')
      .innerJoin('employees', 'emp', 'emp.user_id = user.id')
      .where('emp.organization_id = :orgId', { orgId })
      .orderBy('lr.createdAt', 'DESC')
      .getMany();
    await this.overlayEmployeeNames(requests.map((r) => r.user));
    await this.overlayEmployeeNames(
      requests.flatMap((r) => r.approvals?.map((a) => a.approver) ?? []),
    );
    return requests;
  }

  // ─── Approval Assignments ───

  async createApprovalAssignment(dto: CreateLeaveAssignmentDto) {
    const existing = await this.assignmentRepo.findOne({
      where: {
        user: { id: dto.userId },
        level: dto.level,
      },
    });

    if (existing) {
      existing.approver = { id: dto.approverId } as any;
      existing.organization = { id: dto.organizationId } as any;
      existing.isActive = true;
      return this.assignmentRepo.save(existing);
    }

    const assignment = this.assignmentRepo.create({
      user: { id: dto.userId },
      approver: { id: dto.approverId },
      organization: { id: dto.organizationId },
      level: dto.level,
      isActive: true,
    });
    return this.assignmentRepo.save(assignment);
  }

  async getApprovalAssignments(
    userId: string,
  ): Promise<LeaveApprovalAssignment[]> {
    return this.assignmentRepo.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['approver'],
      order: { level: 'ASC' },
    });
  }

  async getApprovalAssignmentsByOrg(
    orgId: string,
  ): Promise<LeaveApprovalAssignment[]> {
    const assignments = await this.assignmentRepo.find({
      where: { organization: { id: orgId }, isActive: true },
      relations: ['approver', 'user'],
      order: { level: 'ASC' },
    });
    await this.overlayEmployeeNames(assignments.map((a) => a.user));
    await this.overlayEmployeeNames(assignments.map((a) => a.approver));
    return assignments;
  }

  async deleteApprovalAssignment(id: string): Promise<void> {
    const result = await this.assignmentRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Assignment not found');
    }
  }

  // ─── Helpers ───

  private async findHrUserIdInOrg(
    orgId: string,
    branchId?: string | null,
  ): Promise<string | null> {
    // 1. Try same-branch HR first
    if (branchId) {
      const hrEmp = await this.employeeRepo
        .createQueryBuilder('emp')
        .innerJoin('emp.designation', 'desig')
        .where('emp.organizationId = :orgId', { orgId })
        .andWhere('LOWER(desig.name) = :name', { name: 'hr' })
        .andWhere('emp.branchId = :branchId', { branchId })
        .select(['emp.id', 'emp.userId'])
        .getOne();
      if (hrEmp?.userId) return hrEmp.userId;
    }
    // 2. Fall back to any HR in the org
    const hrEmp = await this.employeeRepo
      .createQueryBuilder('emp')
      .innerJoin('emp.designation', 'desig')
      .where('emp.organizationId = :orgId', { orgId })
      .andWhere('LOWER(desig.name) = :name', { name: 'hr' })
      .select(['emp.id', 'emp.userId'])
      .getOne();
    return hrEmp?.userId ?? null;
  }

  private calculateBusinessDays(
    startDateStr: string,
    endDateStr: string,
  ): number {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    let count = 0;

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (!isWeekend) count++;
    }

    return count;
  }

  // ─── Employee Leave Limits (Optional Admin-Set Limits) ───

  async setEmployeeLeaveLimit(dto: SetEmployeeLeaveLimitDto) {
    const {
      userId,
      leaveTypeId,
      maxDaysPerMonth,
      maxDaysPerYear,
      maxDaysPerRequest,
      isEnabled,
    } = dto;

    const user = await this.leaveTypeRepo.manager.findOne('User', {
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const leaveType = await this.leaveTypeRepo.findOne({
      where: { id: leaveTypeId },
      relations: ['organization'],
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    if (!leaveType.organization) {
      throw new NotFoundException('Leave type organization not found');
    }

    const org = leaveType.organization;

    // Check if limit already exists
    let limit = await this.employeeLeaveLimitRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: leaveTypeId } },
      relations: ['organization'],
    });

    if (limit) {
      // Update existing
      limit.maxDaysPerMonth = maxDaysPerMonth ?? limit.maxDaysPerMonth;
      limit.maxDaysPerYear = maxDaysPerYear ?? limit.maxDaysPerYear;
      limit.maxDaysPerRequest = maxDaysPerRequest ?? limit.maxDaysPerRequest;
      if (isEnabled !== undefined) limit.isEnabled = isEnabled;
      return this.employeeLeaveLimitRepo.save(limit);
    }

    // Create new
    limit = this.employeeLeaveLimitRepo.create({
      user: { id: userId },
      leaveType: { id: leaveTypeId },
      organization: org,
      maxDaysPerMonth: maxDaysPerMonth ?? null,
      maxDaysPerYear: maxDaysPerYear ?? null,
      maxDaysPerRequest: maxDaysPerRequest ?? null,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
    });

    return this.employeeLeaveLimitRepo.save(limit);
  }

  async getEmployeeLeaveLimits(userId: string, orgId: string) {
    return this.employeeLeaveLimitRepo.find({
      where: {
        user: { id: userId },
        organization: { id: orgId },
      },
      relations: ['leaveType'],
    });
  }

  async updateEmployeeLeaveLimit(
    userId: string,
    leaveTypeId: string,
    dto: UpdateEmployeeLeaveLimitDto,
  ) {
    const limit = await this.employeeLeaveLimitRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: leaveTypeId } },
    });

    if (!limit)
      throw new NotFoundException('Leave limit not found for this employee');

    if (dto.maxDaysPerMonth !== undefined)
      limit.maxDaysPerMonth = dto.maxDaysPerMonth;
    if (dto.maxDaysPerYear !== undefined)
      limit.maxDaysPerYear = dto.maxDaysPerYear;
    if (dto.maxDaysPerRequest !== undefined)
      limit.maxDaysPerRequest = dto.maxDaysPerRequest;
    if (dto.isEnabled !== undefined) limit.isEnabled = dto.isEnabled;

    return this.employeeLeaveLimitRepo.save(limit);
  }

  async deleteEmployeeLeaveLimit(userId: string, leaveTypeId: string) {
    const limit = await this.employeeLeaveLimitRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: leaveTypeId } },
    });

    if (!limit)
      throw new NotFoundException('Leave limit not found for this employee');

    await this.employeeLeaveLimitRepo.remove(limit);
  }

  async checkLeaveLimit(
    userId: string,
    leaveTypeId: string,
    requestedDays: number,
    startDate?: string,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    paidDays?: number;
    unpaidDays?: number;
  }> {
    const limit = await this.employeeLeaveLimitRepo.findOne({
      where: {
        user: { id: userId },
        leaveType: { id: leaveTypeId },
        isEnabled: true,
      },
    });

    if (!limit) {
      return { allowed: true, paidDays: requestedDays, unpaidDays: 0 };
    }

    if (limit.maxDaysPerRequest && requestedDays > limit.maxDaysPerRequest) {
      return {
        allowed: false,
        reason: `Maximum ${limit.maxDaysPerRequest} days allowed per request. You requested ${requestedDays} days.`,
      };
    }

    if (limit.maxDaysPerYear) {
      const thisYear = new Date().getFullYear();
      const approvedLeaveThisYear = await this.requestRepo.sum('numberOfDays', {
        user: { id: userId },
        leaveType: { id: leaveTypeId },
        status: 'APPROVED',
        createdAt: Between(
          new Date(`${thisYear}-01-01`),
          new Date(`${thisYear}-12-31`),
        ),
      });

      const totalWithNewRequest = (approvedLeaveThisYear || 0) + requestedDays;
      if (totalWithNewRequest > limit.maxDaysPerYear) {
        const remaining = limit.maxDaysPerYear - (approvedLeaveThisYear || 0);
        return {
          allowed: false,
          reason: `Annual limit is ${limit.maxDaysPerYear} days. You have ${remaining} days remaining this year.`,
        };
      }
    }

    let paidDays = requestedDays;
    let unpaidDays = 0;

    if (limit.maxDaysPerMonth !== null && limit.maxDaysPerMonth !== undefined) {
      const referenceDate = startDate ? new Date(startDate) : new Date();
      const monthStart = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        1,
      )
        .toISOString()
        .slice(0, 10);
      const monthEnd = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        0,
      )
        .toISOString()
        .slice(0, 10);

      const usageRow = await this.requestRepo
        .createQueryBuilder('lr')
        .select(
          'COALESCE(SUM(COALESCE(lr.paid_days, lr.number_of_days)), 0)',
          'total',
        )
        .where('lr.user_id = :userId', { userId })
        .andWhere('lr.leave_type_id = :leaveTypeId', { leaveTypeId })
        .andWhere('lr.status IN (:...statuses)', {
          statuses: ['PENDING', 'APPROVED'],
        })
        .andWhere('lr.start_date BETWEEN :monthStart AND :monthEnd', {
          monthStart,
          monthEnd,
        })
        .getRawOne<{ total: string }>();

      const usedPaidDaysThisMonth = Number(usageRow?.total || 0);
      const monthlyPaidLimit = Number(limit.maxDaysPerMonth || 0);
      const remainingPaidDays = Math.max(
        0,
        monthlyPaidLimit - usedPaidDaysThisMonth,
      );

      paidDays = Math.min(requestedDays, remainingPaidDays);
      unpaidDays = Math.max(0, requestedDays - paidDays);
    }

    return {
      allowed: true,
      paidDays,
      unpaidDays,
    };
  }
}
