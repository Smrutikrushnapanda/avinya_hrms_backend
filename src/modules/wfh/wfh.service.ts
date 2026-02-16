import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WfhRequest } from './entities/wfh-request.entity';
import { WfhApproval } from './entities/wfh-approval.entity';
import { WfhApprovalAssignment } from './entities/wfh-approval-assignment.entity';
import { WfhBalance } from './entities/wfh-balance.entity';
import { WfhBalanceTemplate } from './entities/wfh-balance-template.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { MessageService } from '../message/message.service';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { ApplyWfhDto } from './dto/apply-wfh.dto';
import { CreateWfhAssignmentDto } from './dto/create-wfh-assignment.dto';
import { InitializeWfhBalanceDto } from './dto/initialize-wfh-balance.dto';
import { SetWfhBalanceTemplatesDto } from './dto/set-wfh-balance-templates.dto';
import { MessageGateway } from '../message/message.gateway';

@Injectable()
export class WfhService {
  constructor(
    @InjectRepository(WfhRequest)
    private requestRepo: Repository<WfhRequest>,
    @InjectRepository(WfhApproval)
    private approvalRepo: Repository<WfhApproval>,
    @InjectRepository(WfhApprovalAssignment)
    private assignmentRepo: Repository<WfhApprovalAssignment>,
    @InjectRepository(WfhBalance)
    private wfhBalanceRepo: Repository<WfhBalance>,
    @InjectRepository(WfhBalanceTemplate)
    private wfhBalanceTemplateRepo: Repository<WfhBalanceTemplate>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Organization)
    private organizationRepo: Repository<Organization>,
    private messageGateway: MessageGateway,
    private messageService: MessageService,
  ) {}

  async applyForWfh(userId: string, dto: ApplyWfhDto) {
    const numberOfDays = this.calculateDays(dto.date, dto.endDate);
    const balance = await this.wfhBalanceRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!balance || balance.closingBalance < numberOfDays) {
      throw new BadRequestException('Insufficient WFH balance');
    }

    const request = await this.requestRepo.save({
      user: { id: userId },
      date: dto.date,
      endDate: dto.endDate || dto.date,
      numberOfDays,
      reason: dto.reason,
      status: 'PENDING',
    });

    const approvers = await this.assignmentRepo.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['approver'],
      order: { level: 'ASC' },
    });

    let approvalEntities: WfhApproval[] = [];

    const employee = await this.employeeRepo.findOne({
      where: { userId },
    });
    const orgId = employee?.organizationId;
    if (!orgId) {
      throw new BadRequestException('Organization not found for this user');
    }

    const org = await this.organizationRepo.findOne({
      where: { id: orgId },
    });
    const mode = (org?.wfhApprovalMode || 'MANAGER').toUpperCase();

    if (approvers.length && mode !== 'ADMIN') {
      approvalEntities = approvers.map((a) =>
        this.approvalRepo.create({
          wfhRequest: request,
          approver: a.approver,
          level: a.level,
          status: a.level === 1 ? 'PENDING' : 'WAITING',
        }),
      );
    } else {
      const fallbackApprovers: { approverId: string; level: number }[] = [];

      if (mode === 'MANAGER') {
        if (employee?.reportingTo) {
          const manager = await this.employeeRepo.findOne({
            where: { id: employee.reportingTo },
          });
          if (manager?.userId) {
            fallbackApprovers.push({ approverId: manager.userId, level: 1 });
          }
        }
      }

      const adminRoleNames = ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN'];
      const adminUserRole = await this.userRoleRepo
        .createQueryBuilder('ur')
        .innerJoinAndSelect('ur.user', 'user')
        .innerJoinAndSelect('ur.role', 'role')
        .where('user.organizationId = :orgId', { orgId })
        .andWhere('role.roleName IN (:...roles)', { roles: adminRoleNames })
        .andWhere('ur.isActive = true')
        .getOne();

      if (adminUserRole?.user?.id) {
        const adminId = adminUserRole.user.id;
        const already = fallbackApprovers.find((a) => a.approverId === adminId);
        if (!already) {
          fallbackApprovers.push({
            approverId: adminId,
            level: fallbackApprovers.length ? 2 : 1,
          });
        }
      }

      if (!fallbackApprovers.length) {
        throw new BadRequestException('No WFH approvers assigned for this user');
      }

      approvalEntities = fallbackApprovers.map((a) =>
        this.approvalRepo.create({
          wfhRequest: request,
          approver: { id: a.approverId } as any,
          level: a.level,
          status: a.level === 1 ? 'PENDING' : 'WAITING',
        }),
      );
    }
    await this.approvalRepo.save(approvalEntities);

    // Notify level-1 approver via WebSocket
    const level1 = approvalEntities.find((a) => a.level === 1);
    if (level1?.approver) {
      this.messageGateway.emitToUser(level1.approver.id, {
        type: 'wfh:new_request',
        message: `New WFH request received`,
        requestId: request.id,
      });
    }

    return request;
  }

  async approveOrRejectWfh(
    approverId: string,
    requestId: string,
    approve: boolean,
    remarks: string,
  ) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['approvals', 'approvals.approver', 'user'],
    });
    if (!request) throw new NotFoundException('WFH request not found');

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
      const now = new Date();
      for (const ap of request.approvals) {
        if (ap.status === 'PENDING' || ap.status === 'WAITING') {
          ap.status = approve ? 'APPROVED' : 'REJECTED';
          ap.remarks = remarks;
          ap.actionAt = now;
        }
      }
      await this.approvalRepo.save(request.approvals);

      if (!approve) {
        request.status = 'REJECTED';
        await this.requestRepo.save(request);
        this.messageGateway.emitToUser(request.user.id, {
          type: 'wfh:rejected',
          message: `Your WFH request has been rejected`,
          requestId: request.id,
        });
        await this.messageService.createMessage(approverId, {
          organizationId: request.user.organizationId,
          recipientUserIds: [request.user.id],
          title: 'WFH Rejected',
          body: 'Your WFH request has been rejected.',
          type: 'wfh',
        });
        return { message: 'WFH request rejected' };
      }

      request.status = 'APPROVED';
      request.approvedBy = { id: approverId } as any;
      request.approvedAt = now;
      await this.requestRepo.save(request);

      const balance = await this.wfhBalanceRepo.findOne({
        where: { user: { id: request.user.id } },
      });
      if (!balance) {
        throw new NotFoundException('WFH balance not found');
      }
      const daysToDeduct = Math.max(1, request.numberOfDays || 0);
      balance.consumed += daysToDeduct;
      balance.closingBalance -= daysToDeduct;
      await this.wfhBalanceRepo.save(balance);

      this.messageGateway.emitToUser(request.user.id, {
        type: 'wfh:approved',
        message: `Your WFH request has been approved`,
        requestId: request.id,
      });
      await this.messageService.createMessage(approverId, {
        organizationId: request.user.organizationId,
        recipientUserIds: [request.user.id],
        title: 'WFH Approved',
        body: 'Your WFH request has been approved.',
        type: 'wfh',
      });
      return { message: 'WFH request approved' };
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
    const statusText = approve ? 'approved' : 'rejected';

    if (!approve) {
      request.status = 'REJECTED';
      await this.requestRepo.save(request);

      // Notify requester
      this.messageGateway.emitToUser(userId, {
        type: 'wfh:rejected',
        message: `Your WFH request has been rejected`,
        requestId: request.id,
      });
      await this.messageService.createMessage(approverId, {
        organizationId: request.user.organizationId,
        recipientUserIds: [userId],
        title: 'WFH Rejected',
        body: 'Your WFH request has been rejected.',
        type: 'wfh',
      });

      return { message: 'WFH request rejected' };
    }

    const nextLevel = currentApproval.level + 1;
    const nextApproval = request.approvals.find((a) => a.level === nextLevel);

    if (nextApproval) {
      nextApproval.status = 'PENDING';
      await this.approvalRepo.save(nextApproval);

      // Notify next-level approver
      this.messageGateway.emitToUser(nextApproval.approver.id, {
        type: 'wfh:pending_approval',
        message: `WFH request awaiting your approval`,
        requestId: request.id,
      });
    } else {
      request.status = 'APPROVED';
      request.approvedBy = { id: approverId } as any;
      request.approvedAt = new Date();
      await this.requestRepo.save(request);

      const balance = await this.wfhBalanceRepo.findOne({
        where: { user: { id: request.user.id } },
      });
      if (!balance) {
        throw new NotFoundException('WFH balance not found');
      }
      const daysToDeduct = Math.max(1, request.numberOfDays || 0);
      balance.consumed += daysToDeduct;
      balance.closingBalance -= daysToDeduct;
      await this.wfhBalanceRepo.save(balance);

      // Notify requester of final approval
      this.messageGateway.emitToUser(userId, {
        type: 'wfh:approved',
        message: `Your WFH request has been approved`,
        requestId: request.id,
      });
      await this.messageService.createMessage(approverId, {
        organizationId: request.user.organizationId,
        recipientUserIds: [userId],
        title: 'WFH Approved',
        body: 'Your WFH request has been approved.',
        type: 'wfh',
      });
    }

    return { message: `WFH request ${statusText}` };
  }

  async getRequestsByUser(userId: string): Promise<WfhRequest[]> {
    return this.requestRepo.find({
      where: { user: { id: userId } },
      relations: ['approvals', 'approvals.approver'],
      order: { createdAt: 'DESC' },
    });
  }

  async getRequestsByOrg(orgId: string): Promise<WfhRequest[]> {
    return this.requestRepo
      .createQueryBuilder('wfh')
      .leftJoinAndSelect('wfh.user', 'user')
      .leftJoinAndSelect('wfh.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approver')
      .innerJoin('employees', 'emp', 'emp.user_id = user.id')
      .where('emp.organization_id = :orgId', { orgId })
      .orderBy('wfh.createdAt', 'DESC')
      .getMany();
  }

  async getPendingApprovalsForUser(
    approverId: string,
  ): Promise<WfhApproval[]> {
    return this.approvalRepo.find({
      where: { approver: { id: approverId }, status: 'PENDING' },
      relations: ['wfhRequest', 'wfhRequest.user'],
    });
  }

  async getAllApprovalsForUser(approverId: string): Promise<WfhApproval[]> {
    return this.approvalRepo.find({
      where: { approver: { id: approverId } },
      relations: ['wfhRequest', 'wfhRequest.user'],
      order: { actionAt: 'DESC' },
    });
  }

  async createAssignment(dto: CreateWfhAssignmentDto) {
    const assignment = this.assignmentRepo.create({
      user: { id: dto.userId },
      approver: { id: dto.approverId },
      organization: { id: dto.organizationId },
      level: dto.level,
      isActive: true,
    });
    return this.assignmentRepo.save(assignment);
  }

  async getAssignments(userId: string): Promise<WfhApprovalAssignment[]> {
    return this.assignmentRepo.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['approver'],
      order: { level: 'ASC' },
    });
  }

  async deleteAssignment(id: string): Promise<void> {
    const result = await this.assignmentRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Assignment not found');
    }
  }

  // ─── WFH Balance ───

  async getWfhBalance(userId: string): Promise<WfhBalance | null> {
    return this.wfhBalanceRepo.findOne({
      where: { user: { id: userId } },
    });
  }

  async initializeWfhBalance(dto: InitializeWfhBalanceDto): Promise<WfhBalance> {
    const existing = await this.wfhBalanceRepo.findOne({
      where: { user: { id: dto.userId } },
    });
    if (existing) {
      existing.openingBalance = dto.openingBalance;
      existing.closingBalance = dto.openingBalance - existing.consumed;
      if (existing.closingBalance < 0) existing.closingBalance = 0;
      return this.wfhBalanceRepo.save(existing);
    }
    return this.wfhBalanceRepo.save({
      user: { id: dto.userId },
      openingBalance: dto.openingBalance,
      closingBalance: dto.openingBalance,
    });
  }

  async setWfhBalanceTemplates(dto: SetWfhBalanceTemplatesDto) {
    const results: WfhBalanceTemplate[] = [];
    for (const item of dto.items) {
      const existing = await this.wfhBalanceTemplateRepo.findOne({
        where: {
          organization: { id: dto.organizationId },
          employmentType: dto.employmentType,
        },
      });
      if (existing) {
        existing.openingBalance = item.openingBalance;
        results.push(await this.wfhBalanceTemplateRepo.save(existing));
      } else {
        const created = this.wfhBalanceTemplateRepo.create({
          organization: { id: dto.organizationId },
          employmentType: dto.employmentType,
          openingBalance: item.openingBalance,
        });
        results.push(await this.wfhBalanceTemplateRepo.save(created));
      }
    }
    return results;
  }

  async getWfhBalanceTemplates(organizationId: string, employmentType?: string) {
    const where: any = { organization: { id: organizationId } };
    if (employmentType) {
      where.employmentType = employmentType;
    }
    return this.wfhBalanceTemplateRepo.find({
      where,
      order: { employmentType: 'ASC' },
    });
  }

  async applyTemplatesToUser(userId: string, organizationId: string, employmentType: string) {
    if (!employmentType) return;
    const templates = await this.wfhBalanceTemplateRepo.find({
      where: {
        organization: { id: organizationId },
        employmentType,
      },
    });
    if (!templates.length) return;
    const template = templates[0];
    await this.initializeWfhBalance({
      userId,
      openingBalance: template.openingBalance,
    });
  }

  private calculateDays(startDateStr: string, endDateStr?: string): number {
    const startDate = new Date(startDateStr);
    const endDate = endDateStr ? new Date(endDateStr) : startDate;
    let count = 0;

    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (!isWeekend) count++;
    }

    return count || 1;
  }
}
