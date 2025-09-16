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
  ) { }

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

  /** ---- GET BY EMPLOYEE (PAGINATED) - MODIFIED VERSION ---- */
  async findByEmployee(employeeId: string, page = 1, limit = 10) {
    // First get the timeslips with basic approval data
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
      .where('emp.id = :employeeId', { employeeId })
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Get all timeslip IDs for batch processing
    const timeslipIds = items.map(item => item.id);

    if (timeslipIds.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    // Try to get workflow step information
    const workflowInfo = await this.assignmentRepo
      .createQueryBuilder('wa')
      .leftJoin('wa.step', 'ws')
      .leftJoin('ws.workflow', 'w')
      .leftJoin('timeslip_approvals', 'ta', 'ta.approver_id = wa.approver_id')
      .select([
        'ta.timeslip_id',
        'ta.action',
        'ta.approver_id',
        'ws.step_order',
        'ws.name as step_name',
        'w.type as workflow_type',
        'wa.employee_id'
      ])
      .where('ta.timeslip_id IN (:...timeslipIds)', { timeslipIds })
      .andWhere('wa.employee_id = :employeeId', { employeeId })
      .andWhere('w.type = :workflowType', { workflowType: 'TIMESLIP' })
      .andWhere('w.is_active = true')
      .andWhere('ws.status = :stepStatus', { stepStatus: 'ACTIVE' })
      .orderBy('ws.step_order', 'ASC')
      .getRawMany();

    // Group workflow info by timeslip ID
    const workflowByTimeslip = workflowInfo.reduce((acc, item) => {
      if (!acc[item.ta_timeslip_id]) {
        acc[item.ta_timeslip_id] = [];
      }
      acc[item.ta_timeslip_id].push({
        action: item.ta_action,
        stepOrder: item.ws_step_order,
        stepName: item.step_name,
        workflowType: item.workflow_type,
        approverId: item.ta_approver_id
      });
      return acc;
    }, {});

    // Process the results
    const data = items.map((t: any) => {
      const workflowSteps = workflowByTimeslip[t.id] || [];

      // FIXED: Always use approval-based calculation with proper step logic
      const approvals = t.approvals || [];
      const totalSteps = approvals.length;
      const approvedSteps = approvals.filter(a => a.action === 'APPROVED').length;
      const rejectedSteps = approvals.filter(a => a.action === 'REJECTED').length;
      const pendingSteps = approvals.filter(a => a.action === 'PENDING').length;

      // FIXED: Proper currentStep calculation
      let currentStep = 1;
      let currentStepName = 'Step 1';
      let isApproved = false;
      let isRejected = false;

      if (rejectedSteps > 0) {
        isRejected = true;
        // Find first rejected step
        const rejectedIndex = approvals.findIndex(a => a.action === 'REJECTED');
        currentStep = rejectedIndex + 1;
        currentStepName = `Step ${currentStep} - Rejected`;
      } else if (approvedSteps === totalSteps && totalSteps > 0) {
        // All steps approved
        isApproved = true;
        currentStep = totalSteps;
        currentStepName = `Step ${totalSteps} - Completed`;
      } else if (pendingSteps > 0) {
        // Calculate current step: next step after approved ones
        currentStep = approvedSteps + 1;
        currentStepName = `Step ${currentStep} - Pending`;

        // If we have workflow step names, use them
        if (workflowSteps.length > 0) {
          const sortedSteps = workflowSteps.sort((a, b) => a.stepOrder - b.stepOrder);
          const currentWorkflowStep = sortedSteps.find(step => step.action === 'PENDING');
          if (currentWorkflowStep) {
            currentStep = currentWorkflowStep.stepOrder;
            currentStepName = currentWorkflowStep.stepName;
          }
        }
      } else if (totalSteps === 0) {
        // No approvals yet
        currentStep = 1;
        currentStepName = 'Step 1 - Pending';
      }
      if (!currentStep || currentStep === undefined) {
        currentStep = 1; // Default fallback
      }
      // Format approvals
      // MODIFIED: Format approvals with step_no
      const formattedApprovals = approvals.map((a: any, index: number) => {
        let stepNo = index + 1; // Default: use array index (1, 2, 3...)

        // If we have workflow data, try to find the actual step order
        if (workflowSteps.length > 0) {
          const workflowStep = workflowSteps.find(ws => ws.approverId === a.approver_id);
          if (workflowStep && workflowStep.stepOrder) {
            stepNo = workflowStep.stepOrder;
          }
        }

        return {
          id: a.id,
          action: a.action,
          remarks: a.remarks,
          step_no: stepNo,  // ✅ NEW FIELD: Step number (1, 2, 3, etc.)
          acted_at: a.acted_at,
          approver: a.approver ? {
            id: a.approver.id,
            firstName: a.approver.firstName,
            lastName: a.approver.lastName,
            employeeCode: a.approver.employeeCode,
          } : null,
        };
      });


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
        // FIXED: All workflow tracking fields always present
        isApproved,
        isRejected,
        currentStep,        // ✅ ALWAYS PRESENT - Step number (1, 2, 3, etc.)
        currentStepName,    // ✅ ALWAYS PRESENT - Step name with status
        totalSteps,         // ✅ BASED ON ACTUAL APPROVALS COUNT
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

      const timeslipToUpdate = { id } as Timeslip;
      (timeslipToUpdate as any).status =
        anyRejected > 0 ? 'REJECTED' : 'APPROVED';
      await this.timeslipRepo.save(timeslipToUpdate);
    }

    return this.findOne(id);
  }

  /** ---- BATCH UPDATE STATUSES ---- */
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
        // Timeslip fields
        't.id',
        't.date',
        't.missing_type',
        't.corrected_in',
        't.corrected_out',
        't.reason',
        't.status',
        't.created_at',
        't.updated_at',
        // Employee fields
        'emp.id',
        'emp.firstName',
        'emp.lastName',
        'emp.employeeCode',
        'emp.workEmail',
        'emp.photoUrl',
        // Department fields
        'dept.id',
        'dept.name',
        'dept.code',
        // Designation fields
        'desig.id',
        'desig.name',
        'desig.code',
        // Approval fields
        'a.id',
        'a.action',
        'a.remarks',
        'a.acted_at',
        'a.approver_id'
      ])
      .where('a.approver_id = :approverId', { approverId });

    // Add status filter if provided
    if (status) {
      queryBuilder = queryBuilder.andWhere('a.action = :status', { status });
    }

    // Order by creation date (newest first)
    queryBuilder = queryBuilder.orderBy('t.created_at', 'DESC');

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(offset).take(limit);

    // Execute query
    const results = await queryBuilder.getMany();

    // Get timeslip IDs for workflow step calculation
    const timeslipIds = results.map(r => r.id);
    
    if (timeslipIds.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // Get all approvals for these timeslips to calculate current step
    const allApprovals = await this.approvalRepo
      .createQueryBuilder('a')
      .select(['a.timeslip_id', 'a.approver_id', 'a.action'])
      .where('a.timeslip_id IN (:...timeslipIds)', { timeslipIds })
      .orderBy('a.id', 'ASC')
      .getRawMany();

    // Group approvals by timeslip ID
    const approvalsByTimeslip = allApprovals.reduce((acc, item) => {
      if (!acc[item.a_timeslip_id]) {
        acc[item.a_timeslip_id] = [];
      }
      acc[item.a_timeslip_id].push({
        approverId: item.a_approver_id,
        action: item.a_action
      });
      return acc;
    }, {});

    // Transform data to clean structure
    const data = results.map((t: any) => {
      // Find the approval for this approver
      const approval = t.approvals?.find((a: any) => a.approver_id === approverId);
      const timeslipApprovals = approvalsByTimeslip[t.id] || [];
      
      // Calculate current_step for this approver
      let currentStep = false;
      
      if (timeslipApprovals.length > 0) {
        // Find approver's position in the workflow (0-based index)
        const approverIndex = timeslipApprovals.findIndex(a => a.approverId === approverId);
        
        if (approverIndex !== -1) {
          // Count how many approvals before this approver are approved
          const previousApprovals = timeslipApprovals.slice(0, approverIndex);
          const allPreviousApproved = previousApprovals.every(a => a.action === 'APPROVED');
          
          // Current step if all previous approvals are approved (or no previous approvals)
          currentStep = allPreviousApproved;
        }
      } else {
        // Fallback: if no approval data, check if this approval exists and is pending
        currentStep = approval?.action === 'PENDING';
      }

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
        approval: approval ? {
          id: approval.id,
          action: approval.action,
          remarks: approval.remarks,
          acted_at: approval.acted_at,
        } : null,
        current_step: currentStep
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }
}
