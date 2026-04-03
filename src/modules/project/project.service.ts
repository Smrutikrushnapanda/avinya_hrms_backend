import { Injectable, NotFoundException, ForbiddenException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Employee } from '../employee/entities/employee.entity';
import { ProjectIssue, ProjectIssueStatus } from './entities/project-issue.entity';
import { CreateProjectIssueDto } from './dto/create-project-issue.dto';
import { UpdateProjectIssueDto } from './dto/update-project-issue.dto';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { MessageService } from '../message/message.service';

type OrgEmployeeFilters = {
  search?: string;
  designationId?: string;
  limit?: number;
};

type AssignEmployeeInput = {
  userId: string;
  role?: string;
};

type ProjectTimesheetQuery = {
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ProjectService implements OnModuleInit {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private memberRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectIssue)
    private issueRepo: Repository<ProjectIssue>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Timesheet)
    private timesheetRepo: Repository<Timesheet>,
    private messageService: MessageService,
  ) {}

  async onModuleInit() {
    const [{ schema }] = await this.projectRepo.query(
      'SELECT current_schema() AS schema',
    );
    const [{ exists }] = await this.projectRepo.query(
      `SELECT to_regclass('${schema}.project_issues') IS NOT NULL AS exists`,
    );
    if (!exists) return;

    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."project_issues" ADD COLUMN IF NOT EXISTS assignee_user_id uuid`,
    );
  }

  // ── Admin / Manager ─────────────────────────────────────────────────────────

  async create(organizationId: string, createdByUserId: string, dto: CreateProjectDto) {
    const project = this.projectRepo.create({
      organizationId,
      createdByUserId,
      name: dto.name,
      description: dto.description,
      status: dto.status ?? 'planning',
      priority: dto.priority ?? 'medium',
      estimatedEndDate: dto.estimatedEndDate ?? null,
    });
    await this.projectRepo.save(project);

    if (dto.memberUserIds?.length) {
      const members = dto.memberUserIds.map((userId) =>
        this.memberRepo.create({ projectId: project.id, userId, role: 'member' }),
      );
      await this.memberRepo.save(members);
    }

    return this.findOne(project.id);
  }

  async findAll(organizationId: string) {
    const projects = await this.projectRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.createdBy', 'creator')
      .leftJoinAndSelect('p.members', 'pm')
      .leftJoinAndSelect('pm.user', 'u')
      .where('p.organizationId = :orgId', { orgId: organizationId })
      .orderBy('p.createdAt', 'DESC')
      .getMany();

    return projects.map((p) => this.formatProject(p));
  }

  async findOne(id: string) {
    const p = await this.projectRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.createdBy', 'creator')
      .leftJoinAndSelect('p.members', 'pm')
      .leftJoinAndSelect('pm.user', 'u')
      .where('p.id = :id', { id })
      .getOne();

    if (!p) throw new NotFoundException('Project not found');
    return this.formatProject(p);
  }

  async findOneForUser(
    id: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(id, userId, organizationId, isAdminOrManager);
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    Object.assign(project, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.completionPercent !== undefined && { completionPercent: dto.completionPercent }),
      ...(dto.estimatedEndDate !== undefined && { estimatedEndDate: dto.estimatedEndDate }),
    });

    await this.projectRepo.save(project);
    return this.findOne(id);
  }

  async remove(id: string) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.projectRepo.remove(project);
    return { success: true };
  }

  async assignMembers(projectId: string, userIds: string[]) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    for (const userId of userIds) {
      const exists = await this.findMembershipByIdentity(
        projectId,
        userId,
        project.organizationId ?? undefined,
      );
      if (!exists) {
        await this.memberRepo.save(this.memberRepo.create({ projectId, userId, role: 'member' }));
      } else {
        exists.userId = userId;
        exists.role = 'member';
        await this.memberRepo.save(exists);
      }
    }

    return this.findOne(projectId);
  }

  async removeMember(projectId: string, userId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const member = await this.findMembershipByIdentity(
      projectId,
      userId,
      project.organizationId ?? undefined,
    );
    if (!member) throw new NotFoundException('Member not found in this project');
    await this.memberRepo.remove(member);
    return { success: true };
  }

  // ── Employee ────────────────────────────────────────────────────────────────

  async findMyProjects(userId: string, organizationId?: string) {
    const membershipLookupIds = await this.getMembershipLookupIds(userId, organizationId);
    const memberships = await this.memberRepo
      .createQueryBuilder('pm')
      .leftJoinAndSelect('pm.project', 'p')
      .leftJoinAndSelect('p.createdBy', 'creator')
      .leftJoinAndSelect('p.members', 'allMembers')
      .leftJoinAndSelect('allMembers.user', 'u')
      .where('pm.userId IN (:...membershipLookupIds)', { membershipLookupIds })
      .andWhere(
        organizationId ? 'p.organizationId = :organizationId' : '1 = 1',
        organizationId ? { organizationId } : {},
      )
      .orderBy('p.createdAt', 'DESC')
      .getMany();

    return memberships.map((m) => this.formatProject(m.project));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private sanitizeProjectMemberRole(role?: string): string {
    const normalized = String(role ?? 'member').trim().toLowerCase();
    if (!normalized) return 'member';
    if (normalized.length > 30) return normalized.slice(0, 30);
    return normalized;
  }

  private async ensureProjectAccess(
    projectId: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('Project does not belong to your organization');
    }

    if (isAdminOrManager) {
      return project;
    }

    const isMember = await this.findMembershipByIdentity(projectId, userId, organizationId);
    if (!isMember) {
      throw new ForbiddenException('You are not assigned to this project');
    }
    return project;
  }

  private async getMembershipLookupIds(memberIdentifier: string, organizationId?: string) {
    const lookupIds = new Set<string>();
    const normalizedMemberIdentifier = String(memberIdentifier ?? '').trim();

    if (!normalizedMemberIdentifier) {
      return [];
    }

    lookupIds.add(normalizedMemberIdentifier);

    const employee = await this.employeeRepo.findOne({
      where: organizationId
        ? [
            { userId: normalizedMemberIdentifier, organizationId },
            { id: normalizedMemberIdentifier, organizationId },
          ]
        : [{ userId: normalizedMemberIdentifier }, { id: normalizedMemberIdentifier }],
      select: ['id', 'userId'],
    });

    if (employee?.id) lookupIds.add(employee.id);
    if (employee?.userId) lookupIds.add(employee.userId);

    return Array.from(lookupIds);
  }

  private async findMembershipByIdentity(
    projectId: string,
    memberIdentifier: string,
    organizationId?: string,
  ) {
    const lookupIds = await this.getMembershipLookupIds(memberIdentifier, organizationId);
    if (lookupIds.length === 0) {
      return null;
    }

    return this.memberRepo
      .createQueryBuilder('pm')
      .where('pm.projectId = :projectId', { projectId })
      .andWhere('pm.userId IN (:...lookupIds)', { lookupIds })
      .getOne();
  }

  private formatProject(p: Project) {
    const today = new Date().toISOString().split('T')[0];
    const isOverdue =
      p.status !== 'completed' &&
      p.estimatedEndDate != null &&
      p.estimatedEndDate < today;

    const daysRemaining = p.estimatedEndDate
      ? Math.ceil(
          (new Date(p.estimatedEndDate).getTime() - new Date(today).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      id: p.id,
      organizationId: p.organizationId,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      completionPercent: p.completionPercent,
      estimatedEndDate: p.estimatedEndDate,
      isOverdue,
      daysRemaining,
      memberCount: p.members?.length ?? 0,
      members: (p.members ?? []).map((m) => ({
        userId: m.userId,
        role: m.role,
        assignedAt: m.assignedAt,
        user: m.user
          ? {
              id: m.user.id,
              email: m.user.email,
              firstName: m.user.firstName,
              lastName: m.user.lastName,
            }
          : null,
      })),
      createdBy: p.createdBy
        ? {
            id: p.createdBy.id,
            email: p.createdBy.email,
            firstName: p.createdBy.firstName,
            lastName: p.createdBy.lastName,
          }
        : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  // ─── Employee Assignment (for managers) ─────────────────────────────────────

  async getProjectEmployees(
    projectId: string,
    userId?: string,
    organizationId?: string,
    isAdminOrManager = false,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (userId && organizationId) {
      await this.ensureProjectAccess(
        projectId,
        userId,
        organizationId,
        isAdminOrManager,
      );
    }

    // Get all employees assigned to this project via ProjectMember
    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
    });

    // For each member, get their employee record to get reportingTo info
    const employeesWithInfo = await Promise.all(
      members.map(async (m) => {
        const emp = await this.employeeRepo.findOne({
          where: project.organizationId
            ? [
                { userId: m.userId, organizationId: project.organizationId },
                { id: m.userId, organizationId: project.organizationId },
              ]
            : [{ userId: m.userId }, { id: m.userId }],
          relations: ['manager', 'designation', 'user'],
        });
        return {
          userId: emp?.userId ?? m.userId,
          role: m.role,
          assignedAt: m.assignedAt,
          employeeId: emp?.id ?? null,
          employeeCode: emp?.employeeCode ?? null,
          firstName: emp?.firstName ?? m.user?.firstName ?? '',
          lastName: emp?.lastName ?? m.user?.lastName ?? '',
          email: emp?.user?.email ?? m.user?.email ?? '',
          workEmail: emp?.workEmail ?? '',
          designation: emp?.designation?.name ?? null,
          reportingTo: emp?.reportingTo ?? null,
          managerName: emp?.manager ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim() || emp.manager.workEmail : null,
        };
      }),
    );

    return employeesWithInfo;
  }

  async assignEmployees(
    projectId: string,
    assignmentsOrUserIds: AssignEmployeeInput[] | string[],
    requestingUserId: string,
    organizationId: string,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('You cannot assign employees to this project');
    }

    const normalizedAssignmentsRaw = (Array.isArray(assignmentsOrUserIds)
      ? assignmentsOrUserIds
      : []
    )
      .map((entry) =>
        typeof entry === 'string'
          ? { userId: entry, role: 'member' }
          : {
              userId: entry?.userId,
              role: this.sanitizeProjectMemberRole(entry?.role),
            },
      )
      .filter((entry) => Boolean(entry.userId));

    const uniqueAssignmentMap = new Map<string, AssignEmployeeInput>();
    normalizedAssignmentsRaw.forEach((entry) => {
      if (!entry.userId) return;
      uniqueAssignmentMap.set(entry.userId, entry);
    });
    const assignableAssignments = Array.from(uniqueAssignmentMap.values()).filter(
      (entry) => entry.userId !== requestingUserId,
    );
    const assignableUserIds = assignableAssignments.map((entry) => entry.userId);

    if (assignableUserIds.length === 0) {
      return this.getProjectEmployees(projectId);
    }

    const selectedEmployees = await this.employeeRepo.find({
      where: { organizationId, userId: In(assignableUserIds) },
      select: ['id', 'userId', 'reportingTo'],
    });
    const selectedUserIds = new Set(selectedEmployees.map((emp) => emp.userId));
    const outOfOrgUsers = assignableUserIds.filter((uid) => !selectedUserIds.has(uid));
    if (outOfOrgUsers.length > 0) {
      throw new ForbiddenException('Selected employees must belong to your organization');
    }

    // Assign/update each employee on the project
    for (const assignment of assignableAssignments) {
      const userId = assignment.userId;
      const nextRole = this.sanitizeProjectMemberRole(assignment.role);
      const exists = await this.findMembershipByIdentity(
        projectId,
        userId,
        organizationId,
      );
      if (!exists) {
        await this.memberRepo.save(
          this.memberRepo.create({ projectId, userId, role: nextRole }),
        );
      } else {
        exists.userId = userId;
        exists.role = nextRole;
        await this.memberRepo.save(exists);
      }
    }

    // Send notification to newly assigned employees
    await this.sendAssignmentNotification(
      project,
      assignableAssignments,
      requestingUserId,
      organizationId,
    );

    return this.getProjectEmployees(projectId);
  }

  private async sendAssignmentNotification(
    project: Project,
    assignments: AssignEmployeeInput[],
    requestingUserId: string,
    organizationId: string,
  ) {
    try {
      const recipientUserIds = assignments.map((a) => a.userId);
      const roleList = assignments.map((a) => a.role || 'member').join(', ');
      
      await this.messageService.createMessage(requestingUserId, {
        organizationId,
        recipientUserIds,
        title: `Assigned to Project: ${project.name}`,
        body: `You have been assigned to the project "${project.name}" as ${roleList}.\n\nProject Description: ${project.description || 'No description provided'}\n\nPlease check the project details and start working on it.`,
        type: 'project_assignment',
      });
    } catch (error) {
      console.error('Failed to send assignment notification:', error);
    }
  }

  async removeEmployee(
    projectId: string,
    userId: string,
    requestingUserId?: string,
    organizationId?: string,
    isAdminOrManager = false,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    if (requestingUserId && organizationId) {
      await this.ensureProjectAccess(
        projectId,
        requestingUserId,
        organizationId,
        isAdminOrManager,
      );
    }

    if (requestingUserId && userId === requestingUserId && isAdminOrManager) {
      throw new BadRequestException(
        'Manager/Admin cannot remove themselves from the project',
      );
    }

    const member = await this.findMembershipByIdentity(
      projectId,
      userId,
      project.organizationId ?? undefined,
    );
    if (!member) throw new NotFoundException('Employee not found in this project');
    await this.memberRepo.remove(member);
    return { success: true };
  }

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: string,
    organizationId: string,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('Project does not belong to your organization');
    }

    const member = await this.findMembershipByIdentity(
      projectId,
      userId,
      organizationId,
    );
    if (!member) throw new NotFoundException('Member not found in this project');

    member.userId = userId;
    member.role = this.sanitizeProjectMemberRole(role);
    await this.memberRepo.save(member);
    return this.getProjectEmployees(projectId);
  }

  async listIssues(
    projectId: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);
    return this.issueRepo.find({
      where: { projectId, organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async createIssue(
    projectId: string,
    dto: CreateProjectIssueDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    const project = await this.ensureProjectAccess(
      projectId,
      userId,
      organizationId,
      isAdminOrManager,
    );
    if (!dto.pageName?.trim() || !dto.issueTitle?.trim()) {
      throw new BadRequestException('pageName and issueTitle are required');
    }

    let assigneeUserId: string | null = null;
    if (dto.assigneeUserId) {
      const assigneeMembership = await this.findMembershipByIdentity(
        projectId,
        dto.assigneeUserId,
        organizationId,
      );
      if (!assigneeMembership) {
        throw new BadRequestException('Assignee must be a member of this project');
      }
      assigneeUserId = assigneeMembership.userId;
    }

    const status: ProjectIssueStatus = dto.status === 'resolved' ? 'resolved' : 'pending';
    const now = new Date();
    const issue = this.issueRepo.create({
      projectId,
      organizationId: project.organizationId,
      pageName: dto.pageName.trim(),
      issueTitle: dto.issueTitle.trim(),
      description: dto.description?.trim() || null,
      imageUrl: dto.imageUrl?.trim() || null,
      status,
      createdByUserId: userId,
      resolvedByUserId: status === 'resolved' ? userId : null,
      resolvedAt: status === 'resolved' ? now : null,
      assigneeUserId,
    });
    return this.issueRepo.save(issue);
  }

  async updateIssue(
    projectId: string,
    issueId: string,
    dto: UpdateProjectIssueDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);

    const issue = await this.issueRepo.findOne({
      where: { id: issueId, projectId, organizationId },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    if (dto.pageName !== undefined) issue.pageName = dto.pageName.trim();
    if (dto.issueTitle !== undefined) issue.issueTitle = dto.issueTitle.trim();
    if (dto.description !== undefined) issue.description = dto.description?.trim() || null;
    if (dto.imageUrl !== undefined) issue.imageUrl = dto.imageUrl?.trim() || null;
    if (dto.assigneeUserId !== undefined) {
      const normalizedAssigneeIdentifier = String(dto.assigneeUserId ?? '').trim();
      if (!normalizedAssigneeIdentifier) {
        issue.assigneeUserId = null;
      } else {
        const assigneeMembership = await this.findMembershipByIdentity(
          projectId,
          normalizedAssigneeIdentifier,
          organizationId,
        );
        if (!assigneeMembership) {
          throw new BadRequestException('Assignee must be a member of this project');
        }
        issue.assigneeUserId = assigneeMembership.userId;
      }
    }
    if (dto.status !== undefined) {
      issue.status = dto.status;
      if (dto.status === 'resolved') {
        issue.resolvedByUserId = userId;
        issue.resolvedAt = new Date();
      } else {
        issue.resolvedByUserId = null;
        issue.resolvedAt = null;
      }
    }

    return this.issueRepo.save(issue);
  }

  async getProjectTimesheets(
    projectId: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
    query: ProjectTimesheetQuery = {},
  ) {
    const project = await this.ensureProjectAccess(
      projectId,
      userId,
      organizationId,
      isAdminOrManager,
    );

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(Math.max(Number(query.limit ?? 200), 1), 500);

    const qb = this.timesheetRepo
      .createQueryBuilder('ts')
      .leftJoinAndSelect('ts.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .where('ts.organizationId = :organizationId', {
        organizationId: project.organizationId,
      })
      .andWhere(
        "LOWER(TRIM(COALESCE(ts.projectName, ''))) = LOWER(TRIM(:projectName))",
        { projectName: project.name },
      );

    if (query.fromDate) {
      qb.andWhere('ts.date >= :fromDate', { fromDate: query.fromDate });
    }
    if (query.toDate) {
      qb.andWhere('ts.date <= :toDate', { toDate: query.toDate });
    }

    const [results, total] = await qb
      .orderBy('ts.date', 'DESC')
      .addOrderBy('ts.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      projectName: project.name,
    };
  }

  async getAllOrgEmployees(
    organizationId: string,
    requestingUserId: string,
    filters: OrgEmployeeFilters = {},
  ) {
    const search = filters.search?.trim().toLowerCase();
    const designationId = filters.designationId?.trim();
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

    const employees = await this.employeeRepo
      .createQueryBuilder('emp')
      .leftJoinAndSelect('emp.user', 'user')
      .leftJoinAndSelect('emp.department', 'department')
      .leftJoinAndSelect('emp.designation', 'designation')
      .where('emp.organizationId = :organizationId', { organizationId })
      .andWhere('emp.userId <> :requestingUserId', { requestingUserId })
      .andWhere('emp.userId IS NOT NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('user.id IS NOT NULL').orWhere('emp.workEmail IS NOT NULL');
        }),
      )
      .andWhere(
        designationId
          ? 'emp.designationId = :designationId'
          : '1 = 1',
        designationId ? { designationId } : {},
      )
      .andWhere(
        search
          ? new Brackets((qb) => {
              qb.where(
                "LOWER(CONCAT(COALESCE(emp.firstName, ''), ' ', COALESCE(emp.lastName, ''))) LIKE :search",
                { search: `%${search}%` },
              )
                .orWhere('LOWER(emp.employeeCode) LIKE :search', { search: `%${search}%` })
                .orWhere('LOWER(emp.workEmail) LIKE :search', { search: `%${search}%` })
                .orWhere('LOWER(user.email) LIKE :search', { search: `%${search}%` })
                .orWhere('LOWER(designation.name) LIKE :search', { search: `%${search}%` });
            })
          : '1 = 1',
      )
      .orderBy('emp.firstName', 'ASC')
      .addOrderBy('emp.lastName', 'ASC')
      .take(limit)
      .getMany();

    return employees.map((tm) => ({
      employeeId: tm.id,
      employeeCode: tm.employeeCode ?? null,
      userId: tm.userId,
      firstName: tm.firstName,
      lastName: tm.lastName,
      email: tm.user?.email ?? '',
      workEmail: tm.workEmail ?? '',
      department: tm.department?.name ?? null,
      designationId: tm.designationId ?? null,
      designation: tm.designation?.name ?? null,
    }));
  }

  async getMyTeamEmployees(userId: string, organizationId: string) {
    // Find the employee record for this user
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
    });

    if (!employee) {
      return [];
    }

    // Get all employees who report to this manager
    const teamMembers = await this.employeeRepo.find({
      where: { reportingTo: employee.id, organizationId },
      relations: ['user', 'department', 'designation'],
      order: { firstName: 'ASC' },
    });

    return teamMembers.map((tm) => ({
      employeeId: tm.id,
      userId: tm.userId,
      firstName: tm.firstName,
      lastName: tm.lastName,
      email: tm.user?.email ?? '',
      workEmail: tm.workEmail ?? '',
      department: tm.department?.name ?? null,
      designation: tm.designation?.name ?? null,
    }));
  }
}
