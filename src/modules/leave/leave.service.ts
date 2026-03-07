import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from './entities';
import { Employee } from '../employee/entities/employee.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { CreateLeaveAssignmentDto } from './dto/create-leave-assignment.dto';
import { InitializeBalanceDto } from './dto/initialize-balance.dto';
import { SetLeaveBalanceTemplatesDto } from './dto/set-leave-balance-templates.dto';
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
    private messageGateway: MessageGateway,
    private messageService: MessageService,
    private mailService: MailService,
  ) {}

  // ─── Leave Types ───

  async getLeaveTypes(orgId: string, gender?: string): Promise<LeaveType[]> {
    const all = await this.leaveTypeRepo.find({
      where: { organization: { id: orgId } },
    });
    if (!gender) return all;
    // Filter out types that are restricted to a different gender
    return all.filter(
      (lt) => !lt.genderRestriction || lt.genderRestriction.toLowerCase() === gender.toLowerCase(),
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

  async updateLeaveType(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
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

  async initializeLeaveBalance(dto: InitializeBalanceDto): Promise<LeaveBalance> {
    const existing = await this.balanceRepo.findOne({
      where: { user: { id: dto.userId }, leaveType: { id: dto.leaveTypeId } },
    });

    if (existing) {
      existing.openingBalance = dto.openingBalance;
      existing.closingBalance =
        dto.openingBalance + existing.accrued - existing.consumed + existing.carriedForward - existing.encashed;
      return this.balanceRepo.save(existing);
    }

    return this.balanceRepo.save({
      user: { id: dto.userId },
      leaveType: { id: dto.leaveTypeId },
      openingBalance: dto.openingBalance,
      closingBalance: dto.openingBalance,
    });
  }

  // ─── Credit Earned Leave ───

  async creditEarnedLeave(userId: string, days: number, organizationId: string): Promise<LeaveBalance> {
    // Find the org's earned leave type
    const earnedType = await this.leaveTypeRepo.findOne({
      where: { organization: { id: organizationId }, isEarned: true, isActive: true },
    });
    if (!earnedType) {
      throw new NotFoundException('No earned leave type configured for this organization');
    }

    let balance = await this.balanceRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: earnedType.id } },
    });

    if (!balance) {
      balance = this.balanceRepo.create({
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
    return this.balanceRepo.save(balance);
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

  async getLeaveBalanceTemplates(organizationId: string, employmentType?: string) {
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

  async applyTemplatesToUser(userId: string, organizationId: string, employmentType: string) {
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
    const balance = await this.balanceRepo.findOne({
      where: { user: { id: userId }, leaveType: { id: leaveTypeId } },
    });

    if (!balance || balance.closingBalance < numberOfDays) {
      throw new BadRequestException('Insufficient leave balance');
    }

    const request = await this.requestRepo.save({
      user: { id: userId },
      leaveType: { id: leaveTypeId },
      startDate,
      endDate,
      numberOfDays,
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
        const hrUserId = await this.findHrUserIdInOrg(orgId, employee?.branchId);
        if (hrUserId) {
          const already = fallbackApprovers.find((a) => a.approverId === hrUserId);
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
          this.mailService.sendLeaveStatus(
            { email: request.user.email, firstName: request.user.firstName },
            'REJECTED',
            { leaveType: request.leaveType?.name ?? 'Leave', startDate: request.startDate, endDate: request.endDate, numberOfDays: request.numberOfDays, remarks },
            request.user.organizationId,
          ).catch(() => undefined);
        }
        return { message: 'Leave rejected' };
      }

      // Approve the request
      request.status = 'APPROVED';
      request.approvedBy = { id: approverId } as any;
      request.approvedAt = now;
      await this.requestRepo.save(request);

      // Deduct leave balance
      const balance = await this.balanceRepo.findOne({
        where: {
          user: { id: request.user.id },
          leaveType: { id: request.leaveType.id },
        },
      });

      if (balance) {
        const daysToDeduct = Math.max(1, request.numberOfDays || 0);
        balance.consumed += daysToDeduct;
        balance.closingBalance -= daysToDeduct;
        await this.balanceRepo.save(balance);
      }

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
        this.mailService.sendLeaveStatus(
          { email: request.user.email, firstName: request.user.firstName },
          'APPROVED',
          { leaveType: request.leaveType?.name ?? 'Leave', startDate: request.startDate, endDate: request.endDate, numberOfDays: request.numberOfDays, remarks },
          request.user.organizationId,
        ).catch(() => undefined);
      }

      return { message: 'Leave approved' };
    }

    const currentApproval = request.approvals.find(
      (a) => a.approver.id === approverId && a.status === 'PENDING',
    );
    if (!currentApproval) {
      throw new ForbiddenException('Not authorized or already acted');
    }

    currentApproval.status = approve ? 'APPROVED' : 'REJECTED';
    currentApproval.remarks = remarks;
    currentApproval.actionAt = new Date();
    await this.approvalRepo.save(currentApproval);

    const userId = request.user.id;

    if (!approve) {
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
        this.mailService.sendLeaveStatus(
          { email: request.user.email, firstName: request.user.firstName },
          'REJECTED',
          { leaveType: request.leaveType?.name ?? 'Leave', startDate: request.startDate, endDate: request.endDate, numberOfDays: request.numberOfDays, remarks },
          request.user.organizationId,
        ).catch(() => undefined);
      }

      return { message: 'Leave rejected' };
    }

    const nextLevel = currentApproval.level + 1;
    const nextApproval = request.approvals.find((a) => a.level === nextLevel);
    if (nextApproval) {
      nextApproval.status = 'PENDING';
      await this.approvalRepo.save(nextApproval);

      this.messageGateway.emitToUser(nextApproval.approver.id, {
        type: 'leave:pending_approval',
        message: 'Leave request awaiting your approval',
        requestId: request.id,
      });
    } else {
      request.status = 'APPROVED';
      await this.requestRepo.save(request);

      const balance = await this.balanceRepo.findOne({
        where: {
          user: { id: request.user.id },
          leaveType: { id: request.leaveType.id },
        },
      });

      if (!balance) {
        throw new NotFoundException('Leave balance not found');
      }

      const daysToDeduct = Math.max(1, request.numberOfDays || 0);
      balance.consumed += daysToDeduct;
      balance.closingBalance -= daysToDeduct;
      await this.balanceRepo.save(balance);

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
        this.mailService.sendLeaveStatus(
          { email: request.user.email, firstName: request.user.firstName },
          'APPROVED',
          { leaveType: request.leaveType?.name ?? 'Leave', startDate: request.startDate, endDate: request.endDate, numberOfDays: request.numberOfDays, remarks },
          request.user.organizationId,
        ).catch(() => undefined);
      }
    }

    return { message: 'Leave approved' };
  }

  // ─── Queries ───

  async getPendingApprovalsForUser(userId: string): Promise<LeaveApproval[]> {
    return this.approvalRepo.find({
      where: { approver: { id: userId }, status: 'PENDING' },
      relations: [
        'leaveRequest',
        'leaveRequest.user',
        'leaveRequest.leaveType',
      ],
    });
  }

  async getAllApprovalsForUser(approverId: string): Promise<LeaveApproval[]> {
    return this.approvalRepo.find({
      where: { approver: { id: approverId } },
      relations: [
        'leaveRequest',
        'leaveRequest.user',
        'leaveRequest.leaveType',
      ],
      order: { actionAt: 'DESC' },
    });
  }

  async getLeaveRequestsByUser(userId: string): Promise<LeaveRequest[]> {
    return this.requestRepo.find({
      where: { user: { id: userId } },
      relations: ['leaveType', 'approvals', 'approvals.approver'],
      order: { createdAt: 'DESC' },
    });
  }

  async getLeaveRequestsByOrg(orgId: string): Promise<LeaveRequest[]> {
    return this.requestRepo
      .createQueryBuilder('lr')
      .leftJoinAndSelect('lr.user', 'user')
      .leftJoinAndSelect('lr.leaveType', 'leaveType')
      .leftJoinAndSelect('lr.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approver')
      .innerJoin('employees', 'emp', 'emp.user_id = user.id')
      .where('emp.organization_id = :orgId', { orgId })
      .orderBy('lr.createdAt', 'DESC')
      .getMany();
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

  async getApprovalAssignments(userId: string): Promise<LeaveApprovalAssignment[]> {
    return this.assignmentRepo.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['approver'],
      order: { level: 'ASC' },
    });
  }

  async getApprovalAssignmentsByOrg(orgId: string): Promise<LeaveApprovalAssignment[]> {
    return this.assignmentRepo.find({
      where: { organization: { id: orgId }, isActive: true },
      relations: ['approver', 'user'],
      order: { level: 'ASC' },
    });
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
}
