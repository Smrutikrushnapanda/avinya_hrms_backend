import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import {
  LeaveType,
  LeavePolicy,
  LeaveBalance,
  LeaveRequest,
  LeaveApproval,
  LeaveApprovalAssignment,
  LeaveWorkflowConfig,
  Holiday,
} from './entities';

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveType) private leaveTypeRepo: Repository<LeaveType>,
    @InjectRepository(LeavePolicy) private policyRepo: Repository<LeavePolicy>,
    @InjectRepository(LeaveBalance)
    private balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(LeaveRequest)
    private requestRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveApproval)
    private approvalRepo: Repository<LeaveApproval>,
    @InjectRepository(LeaveApprovalAssignment)
    private assignmentRepo: Repository<LeaveApprovalAssignment>,
    @InjectRepository(LeaveWorkflowConfig)
    private workflowRepo: Repository<LeaveWorkflowConfig>,
    @InjectRepository(Holiday) private holidayRepo: Repository<Holiday>,
  ) {}

  async getLeaveTypes(orgId: string): Promise<LeaveType[]> {
    return this.leaveTypeRepo.find({
      where: { organization: { id: orgId } },
    });
  }

  async getLeaveBalance(userId: string): Promise<LeaveBalance[]> {
    return this.balanceRepo.find({
      where: { user: { id: userId } },
      relations: ['leaveType'],
    });
  }

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
    });

    if (!approvers.length)
      throw new BadRequestException('No approvers assigned');

    const approvalEntities = approvers.map((a) =>
      this.approvalRepo.create({
        leaveRequest: request,
        approver: a.approver,
        level: a.level,
        status: a.level === 1 ? 'PENDING' : 'WAITING',
      }),
    );
    await this.approvalRepo.save(approvalEntities);
    return request;
  }

  async approveOrRejectLeave(
    approverId: string,
    requestId: string,
    approve: boolean,
    remarks: string,
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['approvals', 'user'],
    });
    if (!request) throw new NotFoundException('Request not found');

    const currentApproval = request.approvals.find(
      (a) => a.approver.id === approverId && a.status === 'PENDING',
    );
    if (!currentApproval)
      throw new ForbiddenException('Not authorized or already acted');

    currentApproval.status = approve ? 'APPROVED' : 'REJECTED';
    currentApproval.remarks = remarks;
    currentApproval.actionAt = new Date();
    await this.approvalRepo.save(currentApproval);

    if (!approve) {
      request.status = 'REJECTED';
      await this.requestRepo.save(request);
      return { message: 'Leave rejected' };
    }

    const nextLevel = currentApproval.level + 1;
    const nextApproval = request.approvals.find((a) => a.level === nextLevel);
    if (nextApproval) {
      nextApproval.status = 'PENDING';
      await this.approvalRepo.save(nextApproval);
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

      balance.consumed += request.numberOfDays;
      balance.closingBalance -= request.numberOfDays;
      await this.balanceRepo.save(balance);
    }

    return { message: 'Leave approved' };
  }

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
      const isHoliday = false; // TODO: fetch from DB
      if (!isWeekend && !isHoliday) count++;
    }

    return count;
  }
}
