import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Timeslip } from './entities/timeslip.entity';
import { TimeslipApproval } from './entities/timeslip-approval.entity';
import { CreateTimeslipDto } from './dto/create-timeslip.dto';
import { UpdateTimeslipDto } from './dto/update-timeslip.dto';
import { ApproveTimeslipDto } from './dto/approve-timeslip.dto';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { BatchUpdateTimeslipStatusDto } from './dto/batch-update-timeslip-status.dto';
import { BatchApproveSubmissionsDto } from './dto/batch-approve-submissions.dto';
import { MessageGateway } from 'src/modules/message/message.gateway';
import { MessageService } from 'src/modules/message/message.service';
import { Attendance } from 'src/modules/attendance/entities/attendance.entity';
import { AttendanceSettings } from 'src/modules/attendance/entities/attendance-settings.entity';
import { AttendanceCalculationService } from 'src/modules/attendance/attendance-calculation.service';

@Injectable()
export class TimeslipService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectRepository(Timeslip)
    private timeslipRepo: Repository<Timeslip>,
    @InjectRepository(TimeslipApproval)
    private approvalRepo: Repository<TimeslipApproval>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Attendance)
    private attendanceRepo: Repository<Attendance>,
    @InjectRepository(AttendanceSettings)
    private attendanceSettingsRepo: Repository<AttendanceSettings>,
    private readonly messageGateway: MessageGateway,
    private readonly messageService: MessageService,
    private readonly attendanceCalculation: AttendanceCalculationService,
  ) {}

  private async assertTimeslipBelongsToOrg(
    timeslipId: string,
    organizationId?: string,
  ): Promise<Timeslip> {
    if (!organizationId) {
      // SUPERADMIN — skip check
      const timeslip = await this.timeslipRepo.findOne({
        where: { id: timeslipId },
        relations: ['employee'],
      });
      if (!timeslip) throw new NotFoundException('Timeslip not found');
      return timeslip;
    }
    const timeslip = await this.timeslipRepo.findOne({
      where: { id: timeslipId },
      relations: ['employee'],
    });
    if (!timeslip) throw new NotFoundException('Timeslip not found');
    if (timeslip.employee?.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Timeslip does not belong to your organization',
      );
    }
    return timeslip;
  }

  private async assertEmployeeBelongsToOrg(
    employeeId: string,
    organizationId?: string,
  ): Promise<void> {
    if (!organizationId) return; // SUPERADMIN
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new ForbiddenException(
        'Employee does not belong to your organization',
      );
    }
  }

  /**
   * When a timeslip is APPROVED, update the Attendance record with corrected
   * times and recalculate status using the AUTHORITATIVE attendance calculation.
   *
   * CONCURRENCY GUARANTEE:
   * The entire ensure-row → lock → read-locked-state → merge → calculate →
   * write sequence executes inside a single PostgreSQL transaction with
   * SELECT FOR UPDATE on the attendance row. This serializes concurrent
   * attendance writers (punch + timeslip) so that:
   *
   * - An approved IN correction is never overwritten by a raw punch that
   *   read the timeslip before approval.
   * - A real raw out_time is never erased by an IN-only timeslip that
   *   read a stale null out_time.
   * - working_minutes and status are always derived from the final merged
   *   source fields, not from a stale snapshot.
   *
   * TIMELINE:
   *   1. Immutable lookup (outside txn) — existence check, employee FK, date
   *   2. Resolve shift config (outside txn — read-only, immutable)
   *   3. BEGIN transaction
   *   4. Ensure attendance row exists (atomic INSERT ON CONFLICT)
   *   5. SELECT FOR UPDATE on attendance row — serializes all attendance writers
   *   6. Read CURRENT timeslip state via manager.findOne (inside txn, after lock)
   *   7. Apply corrections from the current timeslip (if still APPROVED)
   *   8. Calculate derived fields via AttendanceCalculationService
   *   9. UPDATE attendance row
   *   10. COMMIT
   *
   * NOTE: The SELECT FOR UPDATE locks only the attendance row. The timeslip
   * row is NOT pessimistically locked. Safety comes from reading the timeslip
   * AFTER the attendance lock is held, which serializes this operation against
   * concurrent attendance writers (logAttendance, other applyTimeslip calls).
   */
  private async applyTimeslipToAttendance(timeslipId: string): Promise<void> {
    // ── Step 1: Immutable lookup (outside transaction) ──────────────────
    // Only reads fields that are immutable after creation: id, employee
    // FK, attendance date. Mutable fields (status, corrected_in, corrected_out,
    // missing_type) are re-read inside the transaction.
    const timeslip = await this.timeslipRepo.findOne({
      where: { id: timeslipId },
      relations: ['employee'],
    });

    if (!timeslip || !timeslip.employee?.userId) return;

    const { date, employee } = timeslip;
    const normalizedDate = String(date).slice(0, 10);
    const employeeUserId = employee.userId;
    const employeeOrgId = employee.organizationId;

    // ── Step 2: Resolve shift config (outside transaction) ──────────────
    // Read-only, immutable config — no lock needed.
    const shiftConfig = await this.resolveShiftConfigForEmployee(
      employeeOrgId,
      employeeUserId,
    );

    // ── Step 3-10: Transaction ──────────────────────────────────────────
    await this.dataSource.transaction(async (manager) => {
      // 4. Ensure the attendance row exists. The atomic ON CONFLICT prevents
      //    the insert-if-not-exists race. We only overwrite processed_at on
      //    conflict — all other fields are untouched.
      await manager
        .createQueryBuilder()
        .insert()
        .into(Attendance)
        .values({
          user_id: employeeUserId,
          organization_id: employeeOrgId,
          attendance_date: normalizedDate,
          status: 'pending',
          processed_at: new Date(),
        } as any)
        .orUpdate({
          conflict_target: ['user_id', 'attendance_date'],
          overwrite: ['processed_at'],
        })
        .execute();

      // 5. Lock the attendance row. SELECT FOR UPDATE blocks concurrent
      //    attendance writers (logAttendance, other applyTimeslip calls) until
      //    this transaction commits. This is the serialization point.
      //    The timeslip row itself is NOT locked by this statement.
      const existing = await manager.findOne(Attendance, {
        where: {
          user: { id: employeeUserId },
          attendanceDate: normalizedDate,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existing) return;

      // 6. Read CURRENT timeslip state inside the transaction, after the
      //    attendance lock is held. This guarantees we see the latest committed
      //    state of the timeslip — any concurrent approval that committed
      //    before our lock was acquired is visible here.
      const currentTimeslip = await manager.findOne(Timeslip, {
        where: { id: timeslipId },
      });

      // If the timeslip no longer exists or is no longer approved, do not
      // apply any correction. This prevents an outdated approval from being
      // applied after the timeslip was cancelled/rejected.
      if (!currentTimeslip || currentTimeslip.status !== 'APPROVED') {
        // Timeslip not approved (or cancelled) — nothing to apply.
        // Still update processedAt to record that we checked.
        await manager.update(Attendance, existing.id, {
          processedAt: new Date(),
        });
        return;
      }

      const { missing_type, corrected_in, corrected_out } = currentTimeslip;

      // 7. Resolve effective punch times from the LOCKED attendance state
      //    plus the CURRENT approved timeslip corrections.
      let effectiveIn: Date | null = existing.inTime ?? null;
      let effectiveOut: Date | null = existing.outTime ?? null;

      if ((missing_type === 'IN' || missing_type === 'BOTH') && corrected_in) {
        effectiveIn = new Date(corrected_in);
      }
      if (
        (missing_type === 'OUT' || missing_type === 'BOTH') &&
        corrected_out
      ) {
        effectiveOut = new Date(corrected_out);
      }

      // 8. Determine hasClockOut from the FINAL source fields.
      const hasClockOut =
        effectiveOut !== null ||
        missing_type === 'OUT' ||
        missing_type === 'BOTH';

      // 9. Calculate derived fields from the merged source fields.
      const workingMinutes = this.attendanceCalculation.calculateWorkingMinutes(
        effectiveIn,
        effectiveOut,
      );

      const calcResult = this.attendanceCalculation.determineAttendanceStatus(
        workingMinutes,
        hasClockOut,
        shiftConfig,
        effectiveIn,
      );

      // 10. Write all fields in a single UPDATE inside the same transaction.
      //     Because we hold the row lock, no other writer can modify the row
      //     between our read (step 5) and this write.
      await manager.update(Attendance, existing.id, {
        inTime: effectiveIn,
        outTime: effectiveOut,
        workingMinutes: Math.max(0, workingMinutes),
        status: calcResult.status,
        completionStatus: calcResult.completionStatus,
        punctualityStatus: calcResult.punctualityStatus,
        processedAt: new Date(),
      });
    });
  }

  /**
   * Resolve the effective shift configuration for an employee.
   *
   * Mirrors the priority chain from AttendanceService.resolveShiftConfig:
   * 1. Employee's assigned shift (if active)
   * 2. Employee's assigned branch (if active)
   * 3. Organization-level attendance settings
   */
  private async resolveShiftConfigForEmployee(
    organizationId: string,
    userId: string,
  ) {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      relations: ['branch', 'shift'],
    });

    if (employee?.shiftId) {
      const { AttendanceShift } = await import(
        'src/modules/attendance/entities/attendance-shift.entity'
      );
      // Use the settings repo that's already injected
      const shiftRepo =
        this.attendanceSettingsRepo.manager.getRepository(AttendanceShift);
      const shift = await shiftRepo.findOne({
        where: { id: employee.shiftId, organizationId, isActive: true },
      });
      if (shift) {
        const settings = await this.attendanceSettingsRepo.findOne({
          where: { organizationId },
        });
        return {
          workStartTime: shift.workStartTime,
          workEndTime: shift.workEndTime,
          graceMinutes: shift.graceMinutes,
          lateThresholdMinutes: shift.lateThresholdMinutes,
          halfDayCutoffTime: shift.halfDayCutoffTime,
          workingDays: shift.workingDays,
          weekdayOffRules: shift.weekdayOffRules,
          timezone: settings?.timezone ?? 'Asia/Kolkata',
          requiredWorkingMinutes: settings?.requiredWorkingMinutes ?? null,
        };
      }
    }

    if (employee?.branchId) {
      const { Branch } = await import(
        'src/modules/attendance/entities/branch.entity'
      );
      const branchRepo =
        this.attendanceSettingsRepo.manager.getRepository(Branch);
      const branch = await branchRepo.findOne({
        where: { id: employee.branchId, organizationId, isActive: true },
      });
      if (branch) {
        const settings = await this.attendanceSettingsRepo.findOne({
          where: { organizationId },
        });
        return {
          workStartTime: branch.workStartTime,
          workEndTime: branch.workEndTime,
          graceMinutes: branch.graceMinutes,
          lateThresholdMinutes: branch.lateThresholdMinutes,
          halfDayCutoffTime: branch.halfDayCutoffTime,
          workingDays: branch.workingDays,
          weekdayOffRules: branch.weekdayOffRules,
          timezone: settings?.timezone ?? 'Asia/Kolkata',
          requiredWorkingMinutes: settings?.requiredWorkingMinutes ?? null,
        };
      }
    }

    const settings = await this.attendanceSettingsRepo.findOne({
      where: { organizationId },
    });
    return {
      workStartTime: settings?.workStartTime || '09:00:00',
      workEndTime: settings?.workEndTime || '18:00:00',
      graceMinutes: settings?.graceMinutes ?? 15,
      lateThresholdMinutes: settings?.lateThresholdMinutes ?? 30,
      halfDayCutoffTime: settings?.halfDayCutoffTime || '14:00:00',
      workingDays: settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
      weekdayOffRules: settings?.weekdayOffRules ?? {},
      timezone: settings?.timezone ?? 'Asia/Kolkata',
      requiredWorkingMinutes: settings?.requiredWorkingMinutes ?? null,
    };
  }

  private async notifyEmployeeOnFinalStatus(
    timeslipId: string,
    status: 'APPROVED' | 'REJECTED',
    senderEmployeeId?: string,
  ) {
    const timeslip = await this.timeslipRepo.findOne({
      where: { id: timeslipId },
      relations: ['employee'],
    });
    if (!timeslip?.employee?.userId) return;

    const sender = senderEmployeeId
      ? await this.employeeRepo.findOne({
          where: { id: senderEmployeeId },
          select: ['userId'],
        })
      : null;

    const adminSender = !sender?.userId
      ? await this.employeeRepo
          .createQueryBuilder('emp')
          .leftJoin('emp.user', 'user')
          .leftJoin('user.userRoles', 'ur')
          .leftJoin('ur.role', 'role')
          .where('emp.organizationId = :orgId', {
            orgId: timeslip.employee.organizationId,
          })
          .andWhere('ur.isActive = true')
          .andWhere('role.roleName IN (:...roles)', {
            roles: ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN'],
          })
          .select(['emp.id', 'user.id'])
          .getOne()
      : null;

    const senderUserId =
      sender?.userId || adminSender?.userId || timeslip.employee.userId;

    this.messageGateway.emitToUser(timeslip.employee.userId, {
      type: status === 'APPROVED' ? 'timeslip:approved' : 'timeslip:rejected',
      message:
        status === 'APPROVED'
          ? 'Your timeslip request has been approved'
          : 'Your timeslip request has been rejected',
      timeslipId,
    });

    await this.messageService.createMessage(senderUserId, {
      organizationId: timeslip.employee.organizationId,
      recipientUserIds: [timeslip.employee.userId],
      title: status === 'APPROVED' ? 'Timeslip Approved' : 'Timeslip Rejected',
      body:
        status === 'APPROVED'
          ? 'Your timeslip request has been approved.'
          : 'Your timeslip request has been rejected.',
      type: 'timeslip',
    });
  }

  private async getFallbackApproverId(
    organizationId: string,
    employeeId: string,
  ): Promise<string> {
    // 1) Employee's reporting manager (if set)
    const emp = await this.employeeRepo.findOne({
      where: { id: employeeId },
      select: ['branchId', 'manager'],
      relations: ['manager'],
    });

    if (emp?.manager?.id) {
      return emp.manager.id;
    }

    // 2) Any user with ADMIN or HR role in the same org
    const adminHrUser = await this.dataSource.query(
      `SELECT u.user_id
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.user_id
       INNER JOIN roles r ON r.role_id = ur.role_id
       INNER JOIN employees e ON e.user_id = u.user_id
       WHERE u.organization_id = $1
         AND e.id != $2
         AND UPPER(r.role_name) IN ('ADMIN', 'HR')
       ORDER BY u.created_at ASC
       LIMIT 1`,
      [organizationId, employeeId],
    );

    if (adminHrUser?.[0]?.user_id) {
      // Find the employee record for this user
      const hrEmp = await this.employeeRepo.findOne({
        where: { userId: adminHrUser[0].user_id },
        select: ['id'],
      });
      if (hrEmp?.id) return hrEmp.id;
    }

    // 3) Last-resort: pick any other employee in org
    const anyEmp = await this.employeeRepo
      .createQueryBuilder('emp')
      .where('emp.organizationId = :orgId', { orgId: organizationId })
      .andWhere('emp.id != :employeeId', { employeeId })
      .select(['emp.id'])
      .orderBy('emp.createdAt', 'ASC')
      .getOne();

    if (anyEmp?.id) {
      return anyEmp.id;
    }

    // Absolute fallback: self-approve to avoid blocking timeslip creation
    return employeeId;
  }

  /** ---- CREATE ---- */
  async createTimeslip(dto: CreateTimeslipDto, organizationId?: string) {
    // Org isolation: validate employee belongs to caller's org
    const effectiveOrgId = organizationId ?? dto.organizationId;
    await this.assertEmployeeBelongsToOrg(dto.employeeId, effectiveOrgId);

    // 0a) Cross-field validation: correctedIn must be before correctedOut
    if (dto.correctedIn && dto.correctedOut) {
      if (new Date(dto.correctedIn) >= new Date(dto.correctedOut)) {
        throw new BadRequestException('correctedOut must be after correctedIn');
      }
    }

    // 0b) Duplicate check: prevent re-submission for same employee + date + type
    const existing = await this.timeslipRepo.findOne({
      where: {
        employee: { id: dto.employeeId },
        date: dto.date,
        missing_type: dto.missingType,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A pending timeslip already exists for this employee on this date',
      );
    }

    // 1) Save timeslip
    const timeslip = this.timeslipRepo.create({
      date: dto.date,
      missing_type: dto.missingType,
      corrected_in: dto.correctedIn ?? null,
      corrected_out: dto.correctedOut ?? null,
      reason: dto.reason ?? null,
      employee: { id: dto.employeeId } as Employee,
    });
    await this.timeslipRepo.save(timeslip);

    // 2) Direct admin approval (single approver)
    const approverId = await this.getFallbackApproverId(
      dto.organizationId,
      dto.employeeId,
    );

    const approval = this.approvalRepo.create({
      timeslip: { id: timeslip.id } as Timeslip,
      timeslip_id: timeslip.id,
      approver: approverId ? ({ id: approverId } as Employee) : null,
      approver_id: approverId ?? null,
      action: 'PENDING',
      remarks: null,
      acted_at: null,
    });
    await this.approvalRepo.save(approval);

    return this.findOne(timeslip.id, effectiveOrgId);
  }

  /** ---- GET ALL (paginated) ---- */
  async findAll(page = 1, limit = 50) {
    const maxLimit = 100;
    if (limit > maxLimit) limit = maxLimit;
    const offset = (page - 1) * limit;
    const [data, total] = await this.timeslipRepo.findAndCount({
      relations: ['employee', 'approvals', 'approvals.approver'],
      order: { created_at: 'DESC' as any },
      skip: offset,
      take: limit,
    });
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async findByEmployee(
    employeeId: string,
    page = 1,
    limit = 10,
    organizationId?: string,
  ) {
    // Org isolation: validate employee belongs to caller's org
    if (organizationId) {
      await this.assertEmployeeBelongsToOrg(employeeId, organizationId);
    }

    const qb = this.timeslipRepo
      .createQueryBuilder('t')
      .leftJoin('t.employee', 'emp')
      .leftJoin('t.approvals', 'a')
      .leftJoin('a.approver', 'ap')
      .select([
        't.id',
        't.date',
        't.missing_type',
        't.corrected_in',
        't.corrected_out',
        't.reason',
        't.status',
        't.created_at',
        't.updated_at',
        'a.id',
        'a.action',
        'a.remarks',
        'a.acted_at',
        'a.approver_id',
        'ap.id',
        'ap.firstName',
        'ap.lastName',
        'ap.employeeCode',
      ])
      .where('emp.id = :employeeId', { employeeId });

    if (organizationId) {
      qb.andWhere('emp.organizationId = :organizationId', { organizationId });
    }

    qb.orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    if (items.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const data = items.map((t: any) => this.mapTimeslipItem(t));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** ---- GET ONE ---- */
  async findOne(id: string, organizationId?: string) {
    const timeslip = await this.assertTimeslipBelongsToOrg(id, organizationId);
    return this.timeslipRepo.findOne({
      where: { id },
      relations: ['employee', 'approvals', 'approvals.approver'],
    });
  }

  /** ---- UPDATE ---- */
  async update(id: string, dto: UpdateTimeslipDto, organizationId?: string) {
    // Org isolation: validate timeslip belongs to caller's org
    await this.assertTimeslipBelongsToOrg(id, organizationId);

    await this.timeslipRepo.update(id, {
      date: dto.date,
      missing_type: dto.missingType,
      corrected_in: dto.correctedIn ?? null,
      corrected_out: dto.correctedOut ?? null,
      reason: dto.reason,
      status: dto.status,
    });
    return this.findOne(id, organizationId);
  }

  /** ---- DELETE ---- */
  async remove(id: string, organizationId?: string, actorEmployeeId?: string) {
    const timeslip = await this.assertTimeslipBelongsToOrg(id, organizationId);

    // If actor is an employee (not admin/HR), they can only withdraw their own PENDING timeslip
    if (actorEmployeeId) {
      if (timeslip.employee?.id !== actorEmployeeId) {
        throw new ForbiddenException('You can only withdraw your own timeslip');
      }
      if (timeslip.status !== 'PENDING') {
        throw new BadRequestException(
          'Only pending timeslips can be withdrawn',
        );
      }
    }

    // Remove associated approvals first
    await this.approvalRepo.delete({ timeslip: { id } as any });
    await this.timeslipRepo.remove(timeslip);
    return { deleted: true };
  }

  /** ---- APPROVE ---- */
  async approve(id: string, dto: ApproveTimeslipDto, organizationId?: string) {
    // Org isolation: validate timeslip belongs to caller's org
    await this.assertTimeslipBelongsToOrg(id, organizationId);

    // Find the pending approval for this approver
    const approval = await this.approvalRepo.findOne({
      where: {
        timeslip: { id },
        approver_id: dto.approverId,
        action: 'PENDING',
      },
      relations: ['timeslip'],
    });

    if (!approval) {
      throw new NotFoundException(
        'Approval record not found for this approver or already acted.',
      );
    }

    // Update approval
    approval.action = dto.action; // 'APPROVED' | 'REJECTED'
    approval.remarks = dto.remarks ?? null;
    approval.acted_at = new Date();
    await this.approvalRepo.save(approval);

    // If no pending approvals remain → set timeslip status
    const remainingPending = await this.approvalRepo.count({
      where: { timeslip: { id }, action: 'PENDING' },
    });

    if (remainingPending === 0) {
      // If last approver rejected, mark REJECTED; if last approved, mark APPROVED
      // (If you need "all must approve", this logic is fine; for "any can reject",
      // consider updating status immediately on first REJECTED.)
      const anyRejected = await this.approvalRepo.count({
        where: { timeslip: { id }, action: 'REJECTED' },
      });

      const finalStatus = anyRejected > 0 ? 'REJECTED' : 'APPROVED';
      const timeslipToUpdate = { id } as Timeslip;
      (timeslipToUpdate as any).status = finalStatus;
      await this.timeslipRepo.save(timeslipToUpdate);

      if (finalStatus === 'APPROVED') {
        await this.applyTimeslipToAttendance(id);
      }

      const senderEmployeeId = dto.approverId;
      await this.notifyEmployeeOnFinalStatus(id, finalStatus, senderEmployeeId);
    }

    return this.findOne(id, organizationId);
  }

  /** ---- BATCH UPDATE STATUSES ---- */
  /** ---- CORRECTED BATCH UPDATE STATUSES ---- */
  async batchUpdateStatuses(
    dto: BatchUpdateTimeslipStatusDto,
    approverId?: string,
    organizationId?: string,
  ): Promise<{ updatedCount: number; message: string; errors?: string[] }> {
    const { timeslipIds, status } = dto;
    const errors: string[] = [];
    let successCount = 0;

    // Org isolation: validate all timeslip IDs belong to caller's org
    if (organizationId) {
      const ownedCount = await this.timeslipRepo
        .createQueryBuilder('t')
        .leftJoin('t.employee', 'emp')
        .where('t.id IN (:...ids)', { ids: timeslipIds })
        .andWhere('emp.organizationId = :organizationId', { organizationId })
        .getCount();
      if (ownedCount !== timeslipIds.length) {
        throw new ForbiddenException(
          'One or more timeslips do not belong to your organization',
        );
      }
    }

    if (!approverId && status === 'PENDING') {
      throw new BadRequestException(
        'Admin override cannot set status to PENDING. Use APPROVED or REJECTED.',
      );
    }

    // ✅ FIX 1: Add initial existence check
    const existingTimeslips = await this.timeslipRepo
      .createQueryBuilder('timeslip')
      .where('timeslip.id IN (:...ids)', { ids: timeslipIds })
      .getCount();

    if (existingTimeslips === 0) {
      throw new NotFoundException('No timeslips found with the provided IDs');
    }

    // Process each timeslip individually to maintain workflow integrity
    for (const timeslipId of timeslipIds) {
      try {
        // ✅ FIX 2: Check if timeslip exists and get current status
        const timeslip = await this.timeslipRepo.findOne({
          where: { id: timeslipId },
          select: ['id', 'status'],
        });

        if (!timeslip) {
          errors.push(`Timeslip ${timeslipId} not found`);
          continue;
        }

        if (approverId) {
          // Workflow-based update for specific approver
          const approval = await this.approvalRepo.findOne({
            where: {
              timeslip: { id: timeslipId },
              approver_id: approverId,
              action: 'PENDING',
            },
          });

          if (!approval) {
            errors.push(
              `No pending approval found for timeslip ${timeslipId} and approver ${approverId}`,
            );
            continue;
          }

          // Update the approval
          approval.action = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
          approval.acted_at = new Date();
          await this.approvalRepo.save(approval);

          // Check if workflow is complete
          const remainingPending = await this.approvalRepo.count({
            where: { timeslip: { id: timeslipId }, action: 'PENDING' },
          });

          // Only update timeslip status if workflow is complete
          if (remainingPending === 0) {
            const anyRejected = await this.approvalRepo.count({
              where: { timeslip: { id: timeslipId }, action: 'REJECTED' },
            });

            const finalStatus = anyRejected > 0 ? 'REJECTED' : 'APPROVED';
            await this.timeslipRepo.update(timeslipId, { status: finalStatus });
            if (finalStatus === 'APPROVED') {
              await this.applyTimeslipToAttendance(timeslipId);
            }
            await this.notifyEmployeeOnFinalStatus(
              timeslipId,
              finalStatus,
              approverId,
            );
          }
        } else {
          // ✅ FIX 3: Admin override with validation
          if (
            timeslip.status === 'APPROVED' ||
            timeslip.status === 'REJECTED'
          ) {
            errors.push(
              `Timeslip ${timeslipId} is already in ${timeslip.status} state`,
            );
            continue;
          }

          // Update all pending approvals for this timeslip
          // NOTE: Cannot use approvalRepo.update() with relation WHERE clause —
          // TypeORM 0.3.x Repository.update() does not resolve nested relation
          // objects (e.g. { timeslip: { id } }) the same way find*() methods do,
          // resulting in affected: 0 even when pending approvals exist.
          // QueryBuilder targeting the raw column is the reliable approach.
          const qb = this.approvalRepo
            .createQueryBuilder()
            .update(TimeslipApproval)
            .set({
              action: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
              acted_at: new Date(),
            })
            .where('timeslip_id = :timeslipId', { timeslipId })
            .andWhere('action = :action', { action: 'PENDING' });
          const updateResult = await qb.execute();

          // Only proceed if we actually updated some approvals
          if (updateResult.affected && updateResult.affected > 0) {
            await this.timeslipRepo.update(timeslipId, { status });
            if (status === 'APPROVED') {
              await this.applyTimeslipToAttendance(timeslipId);
            }
            if (status === 'APPROVED' || status === 'REJECTED') {
              await this.notifyEmployeeOnFinalStatus(
                timeslipId,
                status,
                approverId,
              );
            }
          } else {
            errors.push(
              `No pending approvals found for timeslip ${timeslipId}`,
            );
            continue;
          }
        }
        successCount++;
      } catch (error) {
        errors.push(
          `Error processing timeslip ${timeslipId}: ${error.message}`,
        );
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new BadRequestException({
        message: `Failed to update any timeslips: ${errors.join('; ')}`,
        errors,
      });
    }

    return {
      updatedCount: successCount,
      message: `Successfully updated ${successCount} timeslip(s) to ${status} status`,
      ...(errors.length > 0 && { errors }),
    };
  }

  /** ---- Shared mapper for timeslip items ---- */
  private mapTimeslipItem(t: any) {
    const approvals = (t.approvals || []).map((a: any) => ({
      id: a.id,
      action: a.action,
      remarks: a.remarks,
      acted_at: a.acted_at,
      approver: a.approver
        ? {
            id: a.approver.id,
            firstName: a.approver.firstName,
            lastName: a.approver.lastName,
            employeeCode: a.approver.employeeCode,
          }
        : null,
    }));

    const totalSteps = approvals.length;
    const approvedSteps = approvals.filter(
      (a) => a.action === 'APPROVED',
    ).length;
    const rejectedSteps = approvals.filter(
      (a) => a.action === 'REJECTED',
    ).length;
    const pendingSteps = approvals.filter((a) => a.action === 'PENDING').length;
    const isRejected = rejectedSteps > 0;
    const isApproved = approvedSteps > 0 && pendingSteps === 0 && !isRejected;

    return {
      id: t.id,
      date: t.date,
      missing_type: t.missing_type,
      corrected_in: t.corrected_in,
      corrected_out: t.corrected_out,
      reason: t.reason,
      status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at,
      approvals,
      isApproved,
      isRejected,
      currentStep: 1,
      currentStepName: isRejected
        ? 'Rejected'
        : isApproved
          ? 'Approved'
          : 'Pending',
      totalSteps,
      approvalProgress: {
        approved: approvedSteps,
        pending: pendingSteps,
        rejected: rejectedSteps,
        total: totalSteps,
        progressPercentage:
          totalSteps > 0 ? Math.round((approvedSteps / totalSteps) * 100) : 0,
      },
    };
  }

  /** ---- GET ALL BY EMPLOYEE ---- */
  async findAllByEmployee(employeeId: string, organizationId?: string) {
    // Org isolation: validate employee belongs to caller's org
    if (organizationId) {
      await this.assertEmployeeBelongsToOrg(employeeId, organizationId);
    }

    const qb = this.timeslipRepo
      .createQueryBuilder('t')
      .leftJoin('t.employee', 'emp')
      .leftJoin('t.approvals', 'a')
      .leftJoin('a.approver', 'ap')
      .select([
        't.id',
        't.date',
        't.missing_type',
        't.corrected_in',
        't.corrected_out',
        't.reason',
        't.status',
        't.created_at',
        't.updated_at',
        // approvals
        'a.id',
        'a.action',
        'a.remarks',
        'a.acted_at',
        // approver minimal fields
        'ap.id',
        'ap.firstName',
        'ap.lastName',
        'ap.employeeCode',
      ])
      .where('emp.id = :employeeId', { employeeId });

    if (organizationId) {
      qb.andWhere('emp.organizationId = :organizationId', { organizationId });
    }

    const timeslips = await qb.orderBy('t.created_at', 'DESC').getMany();

    return timeslips.map((t: any) => this.mapTimeslipItem(t));
  }

  /** ---- GET TIMESLIPS BY APPROVER ---- */
  async findByApprover(
    approverId: string,
    options: { status?: string; page: number; limit: number },
    organizationId?: string,
  ) {
    const { status, page, limit } = options;

    let queryBuilder = this.timeslipRepo
      .createQueryBuilder('t')
      .leftJoin('t.employee', 'emp')
      .leftJoin('emp.department', 'dept')
      .leftJoin('emp.designation', 'desig')
      .leftJoin('t.approvals', 'a')
      .select([
        't.id',
        't.date',
        't.missing_type',
        't.corrected_in',
        't.corrected_out',
        't.reason',
        't.status',
        't.created_at',
        't.updated_at',
        'emp.id',
        'emp.firstName',
        'emp.lastName',
        'emp.employeeCode',
        'emp.workEmail',
        'emp.photoUrl',
        'emp.passportPhotoUrl',
        'dept.id',
        'dept.name',
        'dept.code',
        'desig.id',
        'desig.name',
        'desig.code',
        'a.id',
        'a.action',
        'a.remarks',
        'a.acted_at',
        'a.approver_id',
      ])
      .where('a.approver_id = :approverId', { approverId });

    if (organizationId) {
      queryBuilder = queryBuilder.andWhere(
        'emp.organizationId = :organizationId',
        { organizationId },
      );
    }

    if (status) {
      queryBuilder = queryBuilder.andWhere('a.action = :status', { status });
    }

    queryBuilder = queryBuilder.orderBy('t.created_at', 'DESC');
    const total = await queryBuilder.getCount();
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(offset).take(limit);
    const results = await queryBuilder.getMany();

    const data = results.map((t: any) => {
      const approval = t.approvals?.find(
        (a: any) => a.approver_id === approverId,
      );
      const totalSteps = t.approvals?.length || 0;
      const isCurrentStep = approval?.action === 'PENDING';

      return {
        id: t.id,
        date: t.date,
        missing_type: t.missing_type,
        corrected_in: t.corrected_in,
        corrected_out: t.corrected_out,
        reason: t.reason,
        status: t.status,
        created_at: t.created_at,
        updated_at: t.updated_at,
        employee: {
          id: t.employee?.id,
          firstName: t.employee?.firstName,
          lastName: t.employee?.lastName,
          employeeCode: t.employee?.employeeCode,
          workEmail: t.employee?.workEmail,
          photoUrl: t.employee?.passportPhotoUrl || t.employee?.photoUrl,
          department: t.employee?.department
            ? {
                id: t.employee.department.id,
                name: t.employee.department.name,
                code: t.employee.department.code,
              }
            : null,
          designation: t.employee?.designation
            ? {
                id: t.employee.designation.id,
                name: t.employee.designation.name,
                code: t.employee.designation.code,
              }
            : null,
        },
        // ✅ WORKING: Now should return correct values
        approval: approval
          ? {
              id: approval.id,
              action: approval.action,
              remarks: approval.remarks,
              acted_at: approval.acted_at,
              total_steps: totalSteps,
              current_step: isCurrentStep,
            }
          : null,
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /** ---- CORRECTED BATCH APPROVE SUBMISSIONS ---- */
  async batchApproveSubmissions(
    dto: BatchApproveSubmissionsDto,
    organizationId?: string,
  ): Promise<{
    updatedCount: number;
    completedTimeslips: string[];
    message: string;
    errors?: string[];
  }> {
    const { approvalIds, action, remarks } = dto;
    const errors: string[] = [];
    const completedTimeslips: string[] = [];
    let successCount = 0;

    // Org isolation: validate all approval IDs belong to caller's org
    if (organizationId) {
      const ownedApprovals = await this.approvalRepo
        .createQueryBuilder('approval')
        .leftJoin('approval.timeslip', 't')
        .leftJoin('t.employee', 'emp')
        .where('approval.id IN (:...ids)', { ids: approvalIds })
        .andWhere('emp.organizationId = :organizationId', { organizationId })
        .getCount();
      if (ownedApprovals !== approvalIds.length) {
        throw new ForbiddenException(
          'One or more approvals do not belong to your organization',
        );
      }
    }

    const existingApprovals = await this.approvalRepo
      .createQueryBuilder('approval')
      .where('approval.id IN (:...ids)', { ids: approvalIds })
      .getCount();

    if (existingApprovals === 0) {
      throw new NotFoundException('No approvals found with the provided IDs');
    }

    for (const approvalId of approvalIds) {
      try {
        const approval = await this.approvalRepo.findOne({
          where: { id: approvalId },
          relations: ['timeslip'],
          select: {
            id: true,
            action: true,
            timeslip_id: true,
            timeslip: { id: true, status: true },
          },
        });

        if (!approval) {
          errors.push(`Approval ${approvalId} not found`);
          continue;
        }

        if (approval.action !== 'PENDING') {
          errors.push(`Approval ${approvalId} is already ${approval.action}`);
          continue;
        }

        approval.action = action;
        approval.remarks = remarks || null;
        approval.acted_at = new Date();
        await this.approvalRepo.save(approval);

        // ✅ FIX: Add null check for timeslip_id
        const timeslipId = approval.timeslip?.id;
        if (!timeslipId) {
          errors.push(`Approval ${approvalId} has no associated timeslip`);
          continue;
        }

        const remainingPending = await this.approvalRepo.count({
          where: { timeslip: { id: timeslipId }, action: 'PENDING' },
        });

        if (remainingPending === 0) {
          const anyRejected = await this.approvalRepo.count({
            where: { timeslip: { id: timeslipId }, action: 'REJECTED' },
          });

          const finalStatus = anyRejected > 0 ? 'REJECTED' : 'APPROVED';
          await this.timeslipRepo.update(timeslipId, { status: finalStatus });
          if (finalStatus === 'APPROVED') {
            await this.applyTimeslipToAttendance(timeslipId);
          }
          const senderEmployeeId = approval.approver_id || undefined;
          await this.notifyEmployeeOnFinalStatus(
            timeslipId,
            finalStatus,
            senderEmployeeId,
          );

          if (!completedTimeslips.includes(timeslipId)) {
            completedTimeslips.push(timeslipId);
          }
        }

        successCount++;
      } catch (error) {
        errors.push(
          `Error processing approval ${approvalId}: ${error.message}`,
        );
      }
    }

    return {
      updatedCount: successCount,
      completedTimeslips,
      message: `Successfully ${action.toLowerCase()} ${successCount} approval(s)`,
      ...(errors.length > 0 && { errors }),
    };
  }
}
