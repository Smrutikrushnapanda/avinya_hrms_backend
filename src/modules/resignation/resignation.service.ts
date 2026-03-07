import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResignationRequest, ResignationStatus } from './entities/resignation-request.entity';
import {
  CreateResignationRequestDto,
  ReviewResignationRequestDto,
} from './dto/resignation.dto';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { User } from '../auth-core/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class ResignationService {
  constructor(
    @InjectRepository(ResignationRequest)
    private readonly resignationRepo: Repository<ResignationRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  private getUserId(user: any): string {
    return user?.userId || user?.id;
  }

  private hasReviewerRole(user: any): boolean {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((r: { roleName?: string }) => String(r?.roleName || '').toUpperCase())
      : [];
    return roles.includes('ADMIN') || roles.includes('HR');
  }

  private buildEmployeeName(employee?: Employee | null): string {
    if (!employee) return 'Employee';
    return [employee.firstName, employee.middleName, employee.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || employee.employeeCode || 'Employee';
  }

  private async getRequestById(id: string): Promise<ResignationRequest> {
    const request = await this.resignationRepo.findOne({
      where: { id },
      relations: ['employee', 'employeeUser', 'organization', 'reviewedByUser'],
    });
    if (!request) {
      throw new NotFoundException('Resignation request not found');
    }
    return request;
  }

  async createRequest(user: any, dto: CreateResignationRequestDto) {
    const userId = this.getUserId(user);
    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    const employee = await this.employeeRepo.findOne({ where: { userId } });
    if (!employee) {
      throw new NotFoundException('Employee profile not found');
    }

    const organization = await this.organizationRepo.findOne({
      where: { id: employee.organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!organization.hrMail) {
      throw new BadRequestException(
        'HR email is not configured. Please ask admin to set Organization HR Mail first.',
      );
    }

    const existingPending = await this.resignationRepo.findOne({
      where: { employeeUserId: userId, status: ResignationStatus.PENDING },
    });
    if (existingPending) {
      throw new BadRequestException('You already have a pending resignation request.');
    }

    const request = await this.resignationRepo.save(
      this.resignationRepo.create({
        organizationId: employee.organizationId,
        employeeId: employee.id,
        employeeUserId: userId,
        message: dto.message.trim(),
        proposedLastWorkingDay: dto.proposedLastWorkingDay || null,
        status: ResignationStatus.PENDING,
      }),
    );

    const employeeName = this.buildEmployeeName(employee);
    const employeeEmail = employee.workEmail || user.email || null;

    await this.mailService.sendResignationRequestToHr({
      hrEmail: organization.hrMail,
      organizationId: organization.id,
      employeeName,
      employeeEmail,
      message: request.message,
      proposedLastWorkingDay: request.proposedLastWorkingDay,
      resignationPolicy: organization.resignationPolicy || undefined,
      noticePeriodDays: organization.resignationNoticePeriodDays || 30,
    });

    return this.getRequestById(request.id);
  }

  async getMyRequests(user: any) {
    const userId = this.getUserId(user);
    return this.resignationRepo.find({
      where: { employeeUserId: userId },
      relations: ['employee', 'organization', 'reviewedByUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrgRequests(user: any, status?: string) {
    if (!this.hasReviewerRole(user)) {
      throw new ForbiddenException('Only HR/Admin can view organization resignation requests');
    }
    const organizationId = user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('Invalid organization context');
    }

    const where: { organizationId: string; status?: ResignationStatus } = { organizationId };
    if (status) {
      where.status = status.toUpperCase() as ResignationStatus;
    }

    return this.resignationRepo.find({
      where,
      relations: ['employee', 'employeeUser', 'organization', 'reviewedByUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async reviewRequest(id: string, user: any, dto: ReviewResignationRequestDto) {
    if (!this.hasReviewerRole(user)) {
      throw new ForbiddenException('Only HR/Admin can review resignation requests');
    }

    const reviewerUserId = this.getUserId(user);
    const reviewer = reviewerUserId
      ? await this.userRepo.findOne({ where: { id: reviewerUserId } })
      : null;

    const request = await this.getRequestById(id);

    if (request.organizationId !== user?.organizationId) {
      throw new ForbiddenException('You cannot review a request outside your organization');
    }
    if (request.status !== ResignationStatus.PENDING) {
      throw new BadRequestException('This resignation request is already reviewed');
    }

    const nextStatus = dto.status;
    request.status = nextStatus;
    request.hrRemarks = dto.hrRemarks?.trim() || null;
    request.reviewedByUserId = reviewerUserId || null;
    request.reviewedAt = new Date();

    if (nextStatus === ResignationStatus.APPROVED) {
      const fallbackDate = new Date();
      fallbackDate.setDate(
        fallbackDate.getDate() + (request.organization?.resignationNoticePeriodDays || 30),
      );
      const canAllowEarly = Boolean(request.organization?.allowEarlyRelievingByAdmin);
      if (dto.allowEarlyRelieving && !canAllowEarly) {
        throw new BadRequestException(
          'Early relieving is disabled in organization resignation policy',
        );
      }
      request.approvedLastWorkingDay =
        dto.approvedLastWorkingDay ||
        request.proposedLastWorkingDay ||
        fallbackDate.toISOString().slice(0, 10);
      request.allowEarlyRelieving = canAllowEarly && Boolean(dto.allowEarlyRelieving);
    } else {
      request.approvedLastWorkingDay = null;
      request.allowEarlyRelieving = false;
    }

    const saved = await this.resignationRepo.save(request);

    const employeeEmail = request.employee?.workEmail || request.employeeUser?.email;
    if (employeeEmail) {
      await this.mailService.sendResignationStatusToEmployee({
        employeeEmail,
        employeeFirstName:
          request.employee?.firstName || request.employeeUser?.firstName || 'Employee',
        organizationId: request.organizationId,
        status: saved.status as ResignationStatus.APPROVED | ResignationStatus.REJECTED,
        hrRemarks: saved.hrRemarks,
        approvedLastWorkingDay: saved.approvedLastWorkingDay,
        allowEarlyRelieving: saved.allowEarlyRelieving,
        reviewerName: reviewer
          ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ').trim() || reviewer.userName
          : undefined,
        resignationPolicy: request.organization?.resignationPolicy || undefined,
      });
    }

    return this.getRequestById(saved.id);
  }
}
