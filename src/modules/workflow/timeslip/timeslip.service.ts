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
import { BatchApproveSubmissionsDto } from './dto/batch-approve-submissions.dto';

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

  const timeslipIds = results.map(t => t.id);
  if (timeslipIds.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
    };
  }

  // ✅ WORKING: Use the same approach as findByEmployee method
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
    .andWhere('w.type = :workflowType', { workflowType: 'TIMESLIP' })
    .andWhere('w.is_active = true')
    .andWhere('ws.status = :stepStatus', { stepStatus: 'ACTIVE' })
    .orderBy('ws.step_order', 'ASC')
    .getRawMany();

  // Group workflow info by timeslip ID and approver
  const workflowByTimeslipAndApprover: Record<string, Record<string, any>> = {};
  workflowInfo.forEach(item => {
    const timeslipId = item.ta_timeslip_id;
    const approverId = item.ta_approver_id;
    
    if (!workflowByTimeslipAndApprover[timeslipId]) {
      workflowByTimeslipAndApprover[timeslipId] = {};
    }
    
    workflowByTimeslipAndApprover[timeslipId][approverId] = {
      action: item.ta_action,
      stepOrder: item.ws_step_order,
      stepName: item.step_name,
      workflowType: item.workflow_type,
      employeeId: item.wa_employee_id
    };
  });

  // ✅ WORKING: Get all approvals for each timeslip (simple query)  
  const allApprovals = await this.approvalRepo
    .createQueryBuilder('ta')
    .select(['ta.id', 'ta.timeslip_id', 'ta.approver_id', 'ta.action', 'ta.acted_at'])
    .where('ta.timeslip_id IN (:...timeslipIds)', { timeslipIds })
    .andWhere('ta.timeslip_id IS NOT NULL')
    .getMany();

  // Group all approvals by timeslip ID
  const allApprovalsByTimeslip: Record<string, any[]> = allApprovals.reduce((acc, approval) => {
    if (approval.timeslip_id) {
      if (!acc[approval.timeslip_id]) {
        acc[approval.timeslip_id] = [];
      }
      acc[approval.timeslip_id].push(approval);
    }
    return acc;
  }, {} as Record<string, any[]>);

  // ✅ WORKING: Calculate workflow info using both workflow data and approval data
  const calculateWorkflowInfo = (timeslipId: string, targetApproverId: string) => {
    const workflowData = workflowByTimeslipAndApprover[timeslipId] || {};
    const allTimeslipApprovals = allApprovalsByTimeslip[timeslipId] || [];
    
    const totalSteps = allTimeslipApprovals.length;
    
    // Get step number from workflow data
    const targetWorkflowData = workflowData[targetApproverId];
    const stepNumber = targetWorkflowData?.stepOrder || 1;
    
    if (totalSteps === 0) {
      return { isCurrentStep: false, stepNumber, totalSteps: 0 };
    }

    // Create a mapping of approver to step order
    const approverStepMap: Record<string, number> = {};
    Object.keys(workflowData).forEach(approverId => {
      approverStepMap[approverId] = workflowData[approverId].stepOrder;
    });

    // Sort approvals by step order
    const sortedApprovals = allTimeslipApprovals.sort((a, b) => {
      const stepA = approverStepMap[a.approver_id] || 999;
      const stepB = approverStepMap[b.approver_id] || 999;
      return stepA - stepB;
    });

    // Check workflow status
    const hasRejected = sortedApprovals.some(a => a.action === 'REJECTED');
    if (hasRejected) {
      return { isCurrentStep: false, stepNumber, totalSteps };
    }

    const allCompleted = sortedApprovals.every(a => a.action !== 'PENDING');
    if (allCompleted) {
      return { isCurrentStep: false, stepNumber, totalSteps };
    }

    // Find first pending approval in step order
    const firstPendingApproval = sortedApprovals.find(a => a.action === 'PENDING');
    const isCurrentStep = firstPendingApproval && firstPendingApproval.approver_id === targetApproverId;
    
    return { isCurrentStep: !!isCurrentStep, stepNumber, totalSteps };
  };

  const data = results.map((t: any) => {
    const approval = t.approvals?.find((a: any) => a.approver_id === approverId);
    
    // ✅ WORKING: Calculate workflow step information
    const { isCurrentStep, stepNumber, totalSteps } = calculateWorkflowInfo(t.id, approverId);

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
        total_steps: totalSteps,      // ✅ From actual approval count
        current_step: isCurrentStep   // ✅ Based on workflow sequence
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
