import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Timeslip } from './entities/timeslip.entity';
import { TimeslipApproval } from './entities/timeslip-approval.entity';
import { CreateTimeslipDto } from './dto/create-timeslip.dto';
import { UpdateTimeslipDto } from './dto/update-timeslip.dto';
import { ApproveTimeslipDto } from './dto/approve-timeslip.dto';
import { Workflow } from 'src/modules/workflow/entities/workflow.entity';
import { WorkflowStep } from 'src/modules/workflow/entities/workflow-step.entity';
import { WorkflowAssignment } from 'src/modules/workflow/entities/workflow-assignment.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { BatchUpdateTimeslipStatusDto } from './dto/batch-update-timeslip-status.dto';


@Injectable()
export class TimeslipService {
  constructor(
    @InjectRepository(Timeslip)
    private timeslipRepo: Repository<Timeslip>,

    @InjectRepository(TimeslipApproval)
    private approvalRepo: Repository<TimeslipApproval>,

    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,

    @InjectRepository(WorkflowStep)
    private stepRepo: Repository<WorkflowStep>,

    @InjectRepository(WorkflowAssignment)
    private assignmentRepo: Repository<WorkflowAssignment>,
  ) {}

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

    // 2) Fetch workflow by type + organization
    const workflow = await this.workflowRepo.findOne({
      where: {
        type: 'TIMESLIP',
        organizationId: dto.organizationId,
        isActive: true,
      },
    });
    if (!workflow) {
      throw new Error(
        `No active workflow of type TIMESLIP for org ${dto.organizationId}`,
      );
    }

    // 3) Steps (ordered)
    const steps = await this.stepRepo.find({
      where: { workflowId: workflow.id, status: 'ACTIVE' },
      order: { stepOrder: 'ASC' },
    });

    // 4) For each step, gather assignments and create TimeslipApproval rows
    const approvals: TimeslipApproval[] = [];
    for (const step of steps) {
      const assignments = await this.assignmentRepo.find({
        where: { stepId: step.id },
        relations: ['approver'], // not required, but harmless
      });

      for (const assignment of assignments) {
        approvals.push(
          this.approvalRepo.create({
            timeslip: { id: timeslip.id } as Timeslip,
            timeslip_id: timeslip.id,
            // approver is optional; assignment may be role-based
            approver: assignment.approverId
              ? ({ id: assignment.approverId } as Employee)
              : null,
            approver_id: assignment.approverId ?? null,
            action: 'PENDING',
            remarks: null,
            acted_at: null,
          }),
        );
      }
    }

    await this.approvalRepo.save(approvals);

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
      // join employee only to filter by employee id (don't select its columns)
      .leftJoin('t.employee', 'emp')
      // join approvals and approver to select required fields
      .leftJoin('t.approvals', 'a')
      .leftJoin('a.approver', 'ap')
      // select only necessary timeslip columns
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
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Map / flatten approvals into a clean shape
    const data = items.map((t: any) => {
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

      const timeslipToUpdate = { id } as Timeslip;
      (timeslipToUpdate as any).status =
        anyRejected > 0 ? 'REJECTED' : 'APPROVED';
      await this.timeslipRepo.save(timeslipToUpdate);
    }

    return this.findOne(id);
  }

  //New Api
  async batchUpdateStatuses(dto: BatchUpdateTimeslipStatusDto): Promise<{ updatedCount: number; message: string }> {
  const { timeslipIds, status } = dto;

  // Check if any of the timeslips exist
  const existingTimeslips = await this.timeslipRepo
    .createQueryBuilder('timeslip')
    .where('timeslip.id IN (:...ids)', { ids: timeslipIds })
    .getCount();

  if (existingTimeslips === 0) {
    throw new NotFoundException('No timeslips found with the provided IDs');
  }

  // Update the timeslips
  const updateResult = await this.timeslipRepo
    .createQueryBuilder()
    .update(Timeslip)
    .set({ status })
    .where('id IN (:...ids)', { ids: timeslipIds })
    .execute();

  const updatedCount = updateResult.affected || 0;

  return {
    updatedCount,
    message: `Successfully updated ${updatedCount} timeslip(s) to ${status} status`
  };
}
}
