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
import { ProjectTestSheetTab, ProjectTestSheetSource } from './entities/project-test-sheet-tab.entity';
import { ProjectTestSheetCase, ProjectTestCaseStatus } from './entities/project-test-sheet-case.entity';
import { ProjectTestSheetChangeLog } from './entities/project-test-sheet-log.entity';
import { CreateProjectTestSheetTabDto } from './dto/create-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetTabDto } from './dto/update-project-test-sheet-tab.dto';
import { CreateProjectTestCaseDto } from './dto/create-project-test-case.dto';
import { UpdateProjectTestCaseDto } from './dto/update-project-test-case.dto';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { MessageService } from '../message/message.service';
import { LogReportService } from '../log-report/log-report.service';

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
    @InjectRepository(ProjectTestSheetTab)
    private testSheetTabRepo: Repository<ProjectTestSheetTab>,
    @InjectRepository(ProjectTestSheetCase)
    private testSheetCaseRepo: Repository<ProjectTestSheetCase>,
    @InjectRepository(ProjectTestSheetChangeLog)
    private testSheetLogRepo: Repository<ProjectTestSheetChangeLog>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Timesheet)
    private timesheetRepo: Repository<Timesheet>,
    private messageService: MessageService,
    private logReportService: LogReportService,
  ) {}

  private readonly defaultTestSheetTabName = 'Sheet 1';

  async onModuleInit() {
    const [{ schema }] = await this.projectRepo.query(
      'SELECT current_schema() AS schema',
    );
    const [{ projectIssuesExists }] = await this.projectRepo.query(
      `SELECT to_regclass('${schema}.project_issues') IS NOT NULL AS "projectIssuesExists"`,
    );
    if (projectIssuesExists) {
      await this.projectRepo.query(
        `ALTER TABLE "${schema}"."project_issues" ADD COLUMN IF NOT EXISTS assignee_user_id uuid`,
      );
    }

    const [{ projectsExists }] = await this.projectRepo.query(
      `SELECT to_regclass('${schema}.projects') IS NOT NULL AS "projectsExists"`,
    );
    if (projectsExists) {
      await this.projectRepo.query(
        `ALTER TABLE "${schema}"."projects" ADD COLUMN IF NOT EXISTS test_sheet_column_headers jsonb`,
      );
    }
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

  private sanitizeTestSheetText(value: unknown, maxLength: number): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number): string | null {
    const normalized = this.sanitizeTestSheetText(value, maxLength);
    return normalized || null;
  }

  private sanitizeTestSheetColumnHeaders(
    input: unknown,
  ): Record<string, string> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }

    const allowedKeys = new Set([
      'caseCode',
      'title',
      'steps',
      'expectedResult',
      'actualResult',
      'qaUserId',
      'developerUserId',
      'status',
      'updatedAt',
    ]);
    const sanitized: Record<string, string> = {};
    const entries = Object.entries(input as Record<string, unknown>).slice(0, 40);

    entries.forEach(([rawKey, rawValue]) => {
      const key = String(rawKey ?? '').trim();
      if (!key) return;
      if (!allowedKeys.has(key) && !/^custom_\d+$/.test(key)) return;

      const value = this.sanitizeTestSheetText(rawValue, 120);
      if (!value) return;
      sanitized[key] = value;
    });

    return sanitized;
  }

  private normalizeTestCaseStatus(status?: string | null): ProjectTestCaseStatus {
    return String(status ?? '').trim().toLowerCase() === 'resolved'
      ? 'resolved'
      : 'pending';
  }

  private makeUniqueTabName(name: string, existingTabs: ProjectTestSheetTab[]) {
    const currentNames = new Set(
      existingTabs.map((tab) => tab.name.trim().toLowerCase()),
    );
    if (!currentNames.has(name.trim().toLowerCase())) return name;

    for (let i = 2; i < 500; i += 1) {
      const candidate = `${name} (${i})`;
      if (!currentNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${name}-${Date.now()}`;
  }

  private async resolveActorName(userId: string, organizationId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      select: ['firstName', 'lastName', 'workEmail'],
    });
    if (!employee) return null;
    const fullName = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
    return fullName || employee.workEmail || null;
  }

  private async resolveAssignableMemberUserId(
    projectId: string,
    organizationId: string,
    value?: string | null,
  ) {
    const normalizedIdentifier = String(value ?? '').trim();
    if (!normalizedIdentifier) return null;

    const membership = await this.findMembershipByIdentity(
      projectId,
      normalizedIdentifier,
      organizationId,
    );
    if (!membership) {
      throw new BadRequestException('Selected user must belong to this project');
    }
    return membership.userId;
  }

  private async createTestSheetChangeLog(payload: {
    projectId: string;
    organizationId: string;
    action: string;
    changedByUserId: string;
    tabId?: string | null;
    testCaseId?: string | null;
    fieldName?: string | null;
    summary?: string | null;
    beforeValue?: Record<string, unknown> | null;
    afterValue?: Record<string, unknown> | null;
  }) {
    const actorName = await this.resolveActorName(
      payload.changedByUserId,
      payload.organizationId,
    );

    const log = await this.testSheetLogRepo.save(
      this.testSheetLogRepo.create({
        projectId: payload.projectId,
        projectSource: 'standalone',
        organizationId: payload.organizationId,
        tabId: payload.tabId ?? null,
        testCaseId: payload.testCaseId ?? null,
        action: payload.action,
        fieldName: payload.fieldName ?? null,
        summary: payload.summary ?? null,
        beforeValue: payload.beforeValue ?? null,
        afterValue: payload.afterValue ?? null,
        changedByUserId: payload.changedByUserId,
        changedByUserName: actorName,
      }),
    );

    try {
      const enabled = await this.logReportService.isEnabled(payload.organizationId);
      if (enabled) {
        await this.logReportService.create({
          organizationId: payload.organizationId,
          userId: payload.changedByUserId,
          userName: actorName ?? undefined,
          actionType: 'TEST_SHEET',
          module: 'test-sheet',
          description: payload.summary || payload.action,
          metadata: {
            projectId: payload.projectId,
            projectSource: 'standalone',
            tabId: payload.tabId ?? null,
            testCaseId: payload.testCaseId ?? null,
            fieldName: payload.fieldName ?? null,
            beforeValue: payload.beforeValue ?? null,
            afterValue: payload.afterValue ?? null,
          },
        });
      }
    } catch (error) {
      console.error('Failed to write test sheet log report', error);
    }

    return log;
  }

  private serializeTestCase(testCase: ProjectTestSheetCase) {
    return {
      caseCode: testCase.caseCode,
      title: testCase.title,
      steps: testCase.steps,
      expectedResult: testCase.expectedResult,
      actualResult: testCase.actualResult,
      qaUserId: testCase.qaUserId,
      developerUserId: testCase.developerUserId,
      status: testCase.status,
      rowIndex: testCase.rowIndex,
    };
  }

  private async ensureDefaultTestSheetTab(
    projectId: string,
    organizationId: string,
    userId: string,
  ) {
    const count = await this.testSheetTabRepo.count({
      where: {
        projectId,
        organizationId,
        projectSource: 'standalone',
      },
    });
    if (count > 0) return;

    const tab = await this.testSheetTabRepo.save(
      this.testSheetTabRepo.create({
        projectId,
        projectSource: 'standalone',
        organizationId,
        name: this.defaultTestSheetTabName,
        orderIndex: 0,
        createdByUserId: userId,
      }),
    );

    await this.createTestSheetChangeLog({
      projectId,
      organizationId,
      changedByUserId: userId,
      action: 'tab_created',
      tabId: tab.id,
      summary: `Created tab "${tab.name}"`,
      afterValue: { name: tab.name, orderIndex: tab.orderIndex },
    });
  }

  private async buildTestSheetResponse(
    projectId: string,
    organizationId: string,
    projectSource: ProjectTestSheetSource = 'standalone',
  ) {
    const [tabs, testCases, logs, project] = await Promise.all([
      this.testSheetTabRepo.find({
        where: { projectId, organizationId, projectSource },
        order: { orderIndex: 'ASC', createdAt: 'ASC' },
      }),
      this.testSheetCaseRepo.find({
        where: { projectId, organizationId, projectSource },
        order: { rowIndex: 'ASC', createdAt: 'ASC' },
      }),
      this.testSheetLogRepo.find({
        where: { projectId, organizationId, projectSource },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
      this.projectRepo.findOne({
        where: { id: projectId, organizationId },
        select: ['id', 'testSheetColumnHeaders'],
      }),
    ]);

    const testCasesByTabId = new Map<string, ProjectTestSheetCase[]>();
    testCases.forEach((row) => {
      const rows = testCasesByTabId.get(row.tabId) ?? [];
      rows.push(row);
      testCasesByTabId.set(row.tabId, rows);
    });

    return {
      projectId,
      projectSource,
      columnHeaders: this.sanitizeTestSheetColumnHeaders(
        project?.testSheetColumnHeaders,
      ),
      tabs: tabs.map((tab) => ({
        id: tab.id,
        name: tab.name,
        orderIndex: tab.orderIndex,
        createdAt: tab.createdAt,
        updatedAt: tab.updatedAt,
        cases: (testCasesByTabId.get(tab.id) ?? []).map((row) => ({
          id: row.id,
          tabId: row.tabId,
          rowIndex: row.rowIndex,
          caseCode: row.caseCode,
          title: row.title,
          steps: row.steps,
          expectedResult: row.expectedResult,
          actualResult: row.actualResult,
          qaUserId: row.qaUserId,
          developerUserId: row.developerUserId,
          status: row.status,
          createdByUserId: row.createdByUserId,
          updatedByUserId: row.updatedByUserId,
          resolvedByUserId: row.resolvedByUserId,
          resolvedAt: row.resolvedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      })),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        fieldName: log.fieldName,
        summary: log.summary,
        beforeValue: log.beforeValue,
        afterValue: log.afterValue,
        changedByUserId: log.changedByUserId,
        changedByUserName: log.changedByUserName,
        tabId: log.tabId,
        testCaseId: log.testCaseId,
        createdAt: log.createdAt,
      })),
    };
  }

  async getTestSheet(
    projectId: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);
    await this.ensureDefaultTestSheetTab(projectId, organizationId, userId);
    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }

  async updateTestSheetColumnHeaders(
    projectId: string,
    columnHeaders: Record<string, unknown>,
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
    await this.ensureDefaultTestSheetTab(projectId, organizationId, userId);

    const nextHeaders = this.sanitizeTestSheetColumnHeaders(columnHeaders);
    const previousHeaders = this.sanitizeTestSheetColumnHeaders(
      project.testSheetColumnHeaders,
    );

    if (JSON.stringify(previousHeaders) !== JSON.stringify(nextHeaders)) {
      project.testSheetColumnHeaders = Object.keys(nextHeaders).length
        ? nextHeaders
        : null;
      await this.projectRepo.save(project);

      await this.createTestSheetChangeLog({
        projectId,
        organizationId,
        changedByUserId: userId,
        action: 'columns_updated',
        fieldName: 'columnHeaders',
        summary: 'Updated test sheet column headers',
        beforeValue: { columnHeaders: previousHeaders },
        afterValue: { columnHeaders: nextHeaders },
      });
    }

    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }

  async createTestSheetTab(
    projectId: string,
    dto: CreateProjectTestSheetTabDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);

    const requestedName = this.sanitizeTestSheetText(dto.name, 120);
    if (!requestedName) {
      throw new BadRequestException('Tab name is required');
    }

    const existingTabs = await this.testSheetTabRepo.find({
      where: { projectId, organizationId, projectSource: 'standalone' },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
    const tabName = this.makeUniqueTabName(requestedName, existingTabs);
    const nextOrderIndex =
      existingTabs.length > 0
        ? Math.max(...existingTabs.map((tab) => Number(tab.orderIndex || 0))) + 1
        : 0;

    const tab = await this.testSheetTabRepo.save(
      this.testSheetTabRepo.create({
        projectId,
        projectSource: 'standalone',
        organizationId,
        name: tabName,
        orderIndex: nextOrderIndex,
        createdByUserId: userId,
      }),
    );

    await this.createTestSheetChangeLog({
      projectId,
      organizationId,
      changedByUserId: userId,
      action: 'tab_created',
      tabId: tab.id,
      summary: `Created tab "${tab.name}"`,
      afterValue: { name: tab.name, orderIndex: tab.orderIndex },
    });

    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }

  async updateTestSheetTab(
    projectId: string,
    tabId: string,
    dto: UpdateProjectTestSheetTabDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);

    const tab = await this.testSheetTabRepo.findOne({
      where: {
        id: tabId,
        projectId,
        organizationId,
        projectSource: 'standalone',
      },
    });
    if (!tab) {
      throw new NotFoundException('Test sheet tab not found');
    }

    const previous = { name: tab.name, orderIndex: tab.orderIndex };
    if (dto.name !== undefined) {
      const nextName = this.sanitizeTestSheetText(dto.name, 120);
      if (!nextName) throw new BadRequestException('Tab name is required');

      const siblingTabs = await this.testSheetTabRepo.find({
        where: { projectId, organizationId, projectSource: 'standalone' },
      });
      tab.name = this.makeUniqueTabName(
        nextName,
        siblingTabs.filter((item) => item.id !== tab.id),
      );
    }

    if (dto.orderIndex !== undefined) {
      tab.orderIndex = Math.max(0, Number(dto.orderIndex || 0));
    }

    await this.testSheetTabRepo.save(tab);

    await this.createTestSheetChangeLog({
      projectId,
      organizationId,
      changedByUserId: userId,
      action: 'tab_updated',
      tabId: tab.id,
      fieldName: 'name,orderIndex',
      summary: `Updated tab "${tab.name}"`,
      beforeValue: previous,
      afterValue: { name: tab.name, orderIndex: tab.orderIndex },
    });

    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }

  async createTestCase(
    projectId: string,
    tabId: string,
    dto: CreateProjectTestCaseDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);

    const tab = await this.testSheetTabRepo.findOne({
      where: { id: tabId, projectId, organizationId, projectSource: 'standalone' },
    });
    if (!tab) {
      throw new NotFoundException('Test sheet tab not found');
    }

    const title = this.sanitizeTestSheetText(dto.title, 250);
    if (!title) {
      throw new BadRequestException('Test case title is required');
    }

    const [qaUserId, developerUserId] = await Promise.all([
      this.resolveAssignableMemberUserId(projectId, organizationId, dto.qaUserId),
      this.resolveAssignableMemberUserId(projectId, organizationId, dto.developerUserId),
    ]);

    const lastRow = await this.testSheetCaseRepo
      .createQueryBuilder('row')
      .where('row.projectId = :projectId', { projectId })
      .andWhere('row.organizationId = :organizationId', { organizationId })
      .andWhere('row.projectSource = :projectSource', { projectSource: 'standalone' })
      .andWhere('row.tabId = :tabId', { tabId })
      .orderBy('row.rowIndex', 'DESC')
      .addOrderBy('row.createdAt', 'DESC')
      .getOne();
    const nextRowIndex = lastRow ? Number(lastRow.rowIndex || 0) + 1 : 0;

    const status = this.normalizeTestCaseStatus(dto.status);
    const now = new Date();
    const testCase = await this.testSheetCaseRepo.save(
      this.testSheetCaseRepo.create({
        projectId,
        projectSource: 'standalone',
        organizationId,
        tabId,
        rowIndex: nextRowIndex,
        caseCode: this.normalizeOptionalText(dto.caseCode, 80),
        title,
        steps: this.normalizeOptionalText(dto.steps, 10000),
        expectedResult: this.normalizeOptionalText(dto.expectedResult, 10000),
        actualResult: this.normalizeOptionalText(dto.actualResult, 10000),
        qaUserId,
        developerUserId,
        status,
        createdByUserId: userId,
        updatedByUserId: userId,
        resolvedByUserId: status === 'resolved' ? userId : null,
        resolvedAt: status === 'resolved' ? now : null,
      }),
    );

    await this.createTestSheetChangeLog({
      projectId,
      organizationId,
      changedByUserId: userId,
      action: 'test_case_created',
      tabId,
      testCaseId: testCase.id,
      summary: `Created test case "${testCase.title}"`,
      afterValue: this.serializeTestCase(testCase),
    });

    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }

  async updateTestCase(
    projectId: string,
    testCaseId: string,
    dto: UpdateProjectTestCaseDto,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    await this.ensureProjectAccess(projectId, userId, organizationId, isAdminOrManager);

    const testCase = await this.testSheetCaseRepo.findOne({
      where: {
        id: testCaseId,
        projectId,
        organizationId,
        projectSource: 'standalone',
      },
    });
    if (!testCase) {
      throw new NotFoundException('Test case not found');
    }

    const beforeSnapshot = this.serializeTestCase(testCase);

    if (dto.caseCode !== undefined) {
      testCase.caseCode = this.normalizeOptionalText(dto.caseCode, 80);
    }
    if (dto.title !== undefined) {
      const nextTitle = this.sanitizeTestSheetText(dto.title, 250);
      if (!nextTitle) throw new BadRequestException('Test case title is required');
      testCase.title = nextTitle;
    }
    if (dto.steps !== undefined) {
      testCase.steps = this.normalizeOptionalText(dto.steps, 10000);
    }
    if (dto.expectedResult !== undefined) {
      testCase.expectedResult = this.normalizeOptionalText(dto.expectedResult, 10000);
    }
    if (dto.actualResult !== undefined) {
      testCase.actualResult = this.normalizeOptionalText(dto.actualResult, 10000);
    }
    if (dto.qaUserId !== undefined) {
      testCase.qaUserId = await this.resolveAssignableMemberUserId(
        projectId,
        organizationId,
        dto.qaUserId,
      );
    }
    if (dto.developerUserId !== undefined) {
      testCase.developerUserId = await this.resolveAssignableMemberUserId(
        projectId,
        organizationId,
        dto.developerUserId,
      );
    }
    if (dto.status !== undefined) {
      const nextStatus = this.normalizeTestCaseStatus(dto.status);
      testCase.status = nextStatus;
      if (nextStatus === 'resolved') {
        testCase.resolvedByUserId = userId;
        testCase.resolvedAt = new Date();
      } else {
        testCase.resolvedByUserId = null;
        testCase.resolvedAt = null;
      }
    }

    testCase.updatedByUserId = userId;
    await this.testSheetCaseRepo.save(testCase);

    const afterSnapshot = this.serializeTestCase(testCase);
    const changedFieldNames = Object.keys(afterSnapshot).filter((fieldName) => {
      const previousValue = (beforeSnapshot as Record<string, unknown>)[fieldName];
      const nextValue = (afterSnapshot as Record<string, unknown>)[fieldName];
      return JSON.stringify(previousValue) !== JSON.stringify(nextValue);
    });

    if (changedFieldNames.length > 0) {
      const beforeValue = Object.fromEntries(
        changedFieldNames.map((fieldName) => [
          fieldName,
          (beforeSnapshot as Record<string, unknown>)[fieldName],
        ]),
      );
      const afterValue = Object.fromEntries(
        changedFieldNames.map((fieldName) => [
          fieldName,
          (afterSnapshot as Record<string, unknown>)[fieldName],
        ]),
      );

      await this.createTestSheetChangeLog({
        projectId,
        organizationId,
        changedByUserId: userId,
        action: 'test_case_updated',
        tabId: testCase.tabId,
        testCaseId: testCase.id,
        fieldName: changedFieldNames.join(','),
        summary: `Updated test case "${testCase.title}"`,
        beforeValue,
        afterValue,
      });
    }

    return this.buildTestSheetResponse(projectId, organizationId, 'standalone');
  }
}
