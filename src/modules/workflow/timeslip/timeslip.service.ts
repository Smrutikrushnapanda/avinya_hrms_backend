import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class TimeslipService {
  constructor(
    @InjectRepository(Timeslip)
    private timeslipRepo: Repository<Timeslip>,
    @InjectRepository(TimeslipApproval)
    private approvalRepo: Repository<TimeslipApproval>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Attendance)
    private attendanceRepo: Repository<Attendance>,
    private readonly messageGateway: MessageGateway,
    private readonly messageService: MessageService,
  ) { }

  /** When a timeslip is APPROVED, update the Attendance record with corrected times */
  private async applyTimeslipToAttendance(timeslipId: string): Promise<void> {
    const timeslip = await this.timeslipRepo.findOne({
      where: { id: timeslipId },
      relations: ['employee'],
    });

    if (!timeslip || !timeslip.employee?.userId) return;

    const { date, missing_type, corrected_in, corrected_out, employee } = timeslip;

    const existing = await this.attendanceRepo.findOne({
      where: { user: { id: employee.userId }, attendanceDate: date },
    });

    let inTime: Date | null = existing?.inTime ?? null;
    let outTime: Date | null = existing?.outTime ?? null;

    if ((missing_type === 'IN' || missing_type === 'BOTH') && corrected_in) {
      inTime = new Date(corrected_in);
    }
    if ((missing_type === 'OUT' || missing_type === 'BOTH') && corrected_out) {
      outTime = new Date(corrected_out);
    }

    let workingMinutes = existing?.workingMinutes ?? 0;
    if (inTime && outTime) {
      workingMinutes = Math.max(0, Math.floor((+outTime - +inTime) / 60000));
    }

    const status: Attendance['status'] =
      workingMinutes < 160 ? 'absent' : workingMinutes >= 480 ? 'present' : 'half-day';

    const updateData: Partial<Attendance> = {
      inTime: inTime ?? existing?.inTime,
      outTime: outTime ?? existing?.outTime,
      workingMinutes,
      status,
      processedAt: new Date(),
    };

    if (existing) {
      await this.attendanceRepo.update(existing.id, updateData);
    } else {
      const newRecord = this.attendanceRepo.create({
        user: { id: employee.userId },
        organization: { id: employee.organizationId },
        attendanceDate: date,
        ...updateData,
      });
      await this.attendanceRepo.save(newRecord);
    }
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
      title:
        status === 'APPROVED' ? 'Timeslip Approved' : 'Timeslip Rejected',
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
    const employee = await this.employeeRepo.findOne({
      where: { id: employeeId },
      select: ['id', 'reportingTo'],
    });

    if (employee?.reportingTo) {
      return employee.reportingTo;
    }

    const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN'];
    const adminEmp = await this.employeeRepo
      .createQueryBuilder('emp')
      .leftJoin('emp.user', 'user')
      .leftJoin('user.userRoles', 'ur')
      .leftJoin('ur.role', 'role')
      .where('emp.organizationId = :orgId', { orgId: organizationId })
      .andWhere('ur.isActive = true')
      .andWhere('role.roleName IN (:...roles)', { roles: adminRoles })
      .select(['emp.id'])
      .getOne();

    if (adminEmp?.id) {
      return adminEmp.id;
    }

    // Last-resort: pick any other employee in org
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
  async createTimeslip(dto: CreateTimeslipDto) {
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

    return this.findOne(timeslip.id);
  }

  /** ---- GET ALL ---- */
  async findAll() {
    return this.timeslipRepo.find({
      relations: ['employee', 'approvals', 'approvals.approver'],
      order: { created_at: 'DESC' as any },
    });
  }

async findByEmployee(employeeId: string, page = 1, limit = 10) {
  const qb = this.timeslipRepo
    .createQueryBuilder('t')
    .leftJoin('t.employee', 'emp')
    .leftJoin('t.approvals', 'a')
    .leftJoin('a.approver', 'ap')
    .select([
      't.id', 't.date', 't.missing_type', 't.corrected_in',
      't.corrected_out', 't.reason', 't.status', 't.created_at', 't.updated_at',
      'a.id', 'a.action', 'a.remarks', 'a.acted_at', 'a.approver_id',
      'ap.id', 'ap.firstName', 'ap.lastName', 'ap.employeeCode',
    ])
    .where('emp.id = :employeeId', { employeeId })
    .orderBy('t.created_at', 'DESC')
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

  const data = items.map((t: any) => {
    const approvals = t.approvals || [];
    const totalSteps = approvals.length;
    const approvedSteps = approvals.filter(a => a.action === 'APPROVED').length;
    const rejectedSteps = approvals.filter(a => a.action === 'REJECTED').length;
    const pendingSteps = approvals.filter(a => a.action === 'PENDING').length;

    const isRejected = rejectedSteps > 0;
    const isApproved = approvedSteps > 0 && pendingSteps === 0 && !isRejected;

    const currentStep = 1;
    const currentStepName = isRejected
      ? 'Rejected'
      : isApproved
        ? 'Approved'
        : 'Pending';

    const formattedApprovals = approvals.map((a: any) => ({
      id: a.id,
      action: a.action,
      remarks: a.remarks,
      step_no: 1,
      acted_at: a.acted_at,
      approver: a.approver ? {
        id: a.approver.id,
        firstName: a.approver.firstName,
        lastName: a.approver.lastName,
        employeeCode: a.approver.employeeCode,
      } : null,
    }));

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
      approvals: formattedApprovals,
      isApproved,
      isRejected,
      currentStep,
      currentStepName,
      totalSteps,
      approvalProgress: {
        approved: approvedSteps,
        pending: pendingSteps,
        rejected: rejectedSteps,
        total: totalSteps,
        progressPercentage: totalSteps > 0 ? Math.round((approvedSteps / totalSteps) * 100) : 0
      }
    };
  });

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}



  /** ---- GET ONE ---- */
  async findOne(id: string) {
    const timeslip = await this.timeslipRepo.findOne({
      where: { id },
      relations: ['employee', 'approvals', 'approvals.approver'],
    });
    if (!timeslip) throw new NotFoundException('Timeslip not found');
    return timeslip;
  }

  /** ---- UPDATE ---- */
  async update(id: string, dto: UpdateTimeslipDto) {
    await this.timeslipRepo.update(id, {
      date: dto.date,
      missing_type: dto.missingType,
      corrected_in: dto.correctedIn ?? null,
      corrected_out: dto.correctedOut ?? null,
      reason: dto.reason,
      status: dto.status,
    });
    return this.findOne(id);
  }

  /** ---- DELETE ---- */
  async remove(id: string) {
    const timeslip = await this.findOne(id);
    await this.timeslipRepo.remove(timeslip);
    return { deleted: true };
  }

  /** ---- APPROVE ---- */
  async approve(id: string, dto: ApproveTimeslipDto) {
    // ensure timeslip exists
    await this.findOne(id);

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
      await this.notifyEmployeeOnFinalStatus(
        id,
        finalStatus,
        senderEmployeeId,
      );
    }

    return this.findOne(id);
  }

  /** ---- BATCH UPDATE STATUSES ---- */
  /** ---- CORRECTED BATCH UPDATE STATUSES ---- */
async batchUpdateStatuses(dto: BatchUpdateTimeslipStatusDto, approverId?: string): Promise<{ updatedCount: number; message: string; errors?: string[] }> {
  const { timeslipIds, status } = dto;
  const errors: string[] = [];
  let successCount = 0;

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
        select: ['id', 'status']
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
          }
        });

        if (!approval) {
          errors.push(`No pending approval found for timeslip ${timeslipId} and approver ${approverId}`);
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
            finalStatus as 'APPROVED' | 'REJECTED',
            approverId,
          );
        }
      } else {
        // ✅ FIX 3: Admin override with validation
        if (timeslip.status === 'APPROVED' || timeslip.status === 'REJECTED') {
          errors.push(`Timeslip ${timeslipId} is already in ${timeslip.status} state`);
          continue;
        }

        // Update all pending approvals for this timeslip
        const updateResult = await this.approvalRepo.update(
          { timeslip: { id: timeslipId }, action: 'PENDING' },
          { 
            action: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            acted_at: new Date()
          }
        );

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
          errors.push(`No pending approvals found for timeslip ${timeslipId}`);
          continue;
        }
      }
      successCount++;
    } catch (error) {
      errors.push(`Error processing timeslip ${timeslipId}: ${error.message}`);
    }
  }

  return {
    updatedCount: successCount,
    message: `Successfully updated ${successCount} timeslip(s) to ${status} status`,
    ...(errors.length > 0 && { errors })
  };
}

  /** ---- GET ALL BY EMPLOYEE ---- */
  async findAllByEmployee(employeeId: string) {
    const timeslips = await this.timeslipRepo
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
      .where('emp.id = :employeeId', { employeeId })
      .orderBy('t.created_at', 'DESC')
      .getMany();

    // Map to clean structure (same as your existing paginated method)
    return timeslips.map((t: any) => {
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
      };
    });
  }

  /** ---- GET TIMESLIPS BY APPROVER ---- */
async findByApprover(approverId: string, options: { status?: string; page: number; limit: number }) {
  const { status, page, limit } = options;

  let queryBuilder = this.timeslipRepo
    .createQueryBuilder('t')
    .leftJoin('t.employee', 'emp')
    .leftJoin('emp.department', 'dept')
    .leftJoin('emp.designation', 'desig')
    .leftJoin('t.approvals', 'a')
    .select([
      't.id', 't.date', 't.missing_type', 't.corrected_in',
      't.corrected_out', 't.reason', 't.status', 't.created_at', 't.updated_at',
      'emp.id', 'emp.firstName', 'emp.lastName', 'emp.employeeCode',
      'emp.workEmail', 'emp.photoUrl',
      'dept.id', 'dept.name', 'dept.code',
      'desig.id', 'desig.name', 'desig.code',
      'a.id', 'a.action', 'a.remarks', 'a.acted_at', 'a.approver_id'
    ])
    .where('a.approver_id = :approverId', { approverId });

  if (status) {
    queryBuilder = queryBuilder.andWhere('a.action = :status', { status });
  }

  queryBuilder = queryBuilder.orderBy('t.created_at', 'DESC');
  const total = await queryBuilder.getCount();
  const offset = (page - 1) * limit;
  queryBuilder = queryBuilder.skip(offset).take(limit);
  const results = await queryBuilder.getMany();

  const data = results.map((t: any) => {
    const approval = t.approvals?.find((a: any) => a.approver_id === approverId);
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
        photoUrl: t.employee?.photoUrl,
        department: t.employee?.department ? {
          id: t.employee.department.id,
          name: t.employee.department.name,
          code: t.employee.department.code,
        } : null,
        designation: t.employee?.designation ? {
          id: t.employee.designation.id,
          name: t.employee.designation.name,
          code: t.employee.designation.code,
        } : null,
      },
      // ✅ WORKING: Now should return correct values
      approval: approval ? {
        id: approval.id,
        action: approval.action,
        remarks: approval.remarks,
        acted_at: approval.acted_at,
        total_steps: totalSteps,
        current_step: isCurrentStep,
      } : null,
    };
  });

  return {
    data,
    pagination: {
      page, limit, total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}

/** ---- CORRECTED BATCH APPROVE SUBMISSIONS ---- */
async batchApproveSubmissions(dto: BatchApproveSubmissionsDto): Promise<{ 
  updatedCount: number; 
  completedTimeslips: string[];
  message: string; 
  errors?: string[] 
}> {
  const { approvalIds, action, remarks } = dto;
  const errors: string[] = [];
  const completedTimeslips: string[] = [];
  let successCount = 0;

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
          timeslip: { id: true, status: true }
        }
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
          finalStatus as 'APPROVED' | 'REJECTED',
          senderEmployeeId,
        );

        if (!completedTimeslips.includes(timeslipId)) {
          completedTimeslips.push(timeslipId);
        }
      }

      successCount++;
    } catch (error) {
      errors.push(`Error processing approval ${approvalId}: ${error.message}`);
    }
  }

  return {
    updatedCount: successCount,
    completedTimeslips,
    message: `Successfully ${action.toLowerCase()} ${successCount} approval(s)`,
    ...(errors.length > 0 && { errors })
  };
}

}
