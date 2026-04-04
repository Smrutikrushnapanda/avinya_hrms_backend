import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientProject } from './entities/project.entity';
import { ClientProjectMember } from './entities/client-project-member.entity';
import { ProjectTask, TaskStatus, TaskPriority } from './entities/project-task.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Timesheet } from 'src/modules/workflow/timesheet/entities/timesheet.entity';
import { MessageService } from '../message/message.service';
import { LogReportService } from '../log-report/log-report.service';
import { ProjectTestSheetTab, ProjectTestSheetSource } from '../project/entities/project-test-sheet-tab.entity';
import { ProjectTestSheetCase, ProjectTestCaseStatus } from '../project/entities/project-test-sheet-case.entity';
import { ProjectTestSheetChangeLog } from '../project/entities/project-test-sheet-log.entity';
import { CreateProjectTestSheetTabDto } from '../project/dto/create-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetTabDto } from '../project/dto/update-project-test-sheet-tab.dto';
import { CreateProjectTestCaseDto } from '../project/dto/create-project-test-case.dto';
import { UpdateProjectTestCaseDto } from '../project/dto/update-project-test-case.dto';

type AssignEmployeeInput = {
  userId: string;
  role?: string;
};

@Injectable()
export class ProjectsService implements OnModuleInit {
  constructor(
    @InjectRepository(ClientProject)
    private projectRepo: Repository<ClientProject>,
    @InjectRepository(ClientProjectMember)
    private memberRepo: Repository<ClientProjectMember>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(ProjectTask)
    private taskRepo: Repository<ProjectTask>,
    @InjectRepository(ProjectTestSheetTab)
    private testSheetTabRepo: Repository<ProjectTestSheetTab>,
    @InjectRepository(ProjectTestSheetCase)
    private testSheetCaseRepo: Repository<ProjectTestSheetCase>,
    @InjectRepository(ProjectTestSheetChangeLog)
    private testSheetLogRepo: Repository<ProjectTestSheetChangeLog>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Timesheet)
    private timesheetRepo: Repository<Timesheet>,
    private messageService: MessageService,
    private logReportService: LogReportService,
  ) {}

  private readonly defaultTestSheetTabName = 'Sheet 1';

  async onModuleInit() {
    // Ensure compatibility columns exist for older databases.
    // Use active schema (not hardcoded public) to avoid boot failures.
    const [{ schema }] = await this.projectRepo.query(
      'SELECT current_schema() AS schema',
    );
    const [{ exists }] = await this.projectRepo.query(
      `SELECT to_regclass('${schema}.client_projects') IS NOT NULL AS exists`,
    );
    if (!exists) return;

    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."client_projects" ADD COLUMN IF NOT EXISTS manager_id uuid`,
    );
    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."client_projects" ADD COLUMN IF NOT EXISTS completion_percent integer DEFAULT 0`,
    );
    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."client_projects" ADD COLUMN IF NOT EXISTS project_cost decimal(12,2)`,
    );
    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."client_projects" ADD COLUMN IF NOT EXISTS hourly_rate decimal(10,2)`,
    );
    await this.projectRepo.query(
      `ALTER TABLE "${schema}"."client_projects" ADD COLUMN IF NOT EXISTS test_sheet_column_headers jsonb`,
    );
  }

  private sanitizeProjectMemberRole(role?: string): string {
    const normalized = String(role ?? 'member').trim().toLowerCase();
    if (!normalized) return 'member';
    if (normalized.length > 30) return normalized.slice(0, 30);
    return normalized;
  }

  private async generateProjectCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = `PRJ-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
      const exists = await this.projectRepo.findOne({ where: { projectCode: code } });
      if (!exists) return code;
    }
    return `PRJ-${Date.now().toString(36).toUpperCase()}`;
  }

  create(dto: CreateProjectDto) {
    const saveProject = async () => {
      if (dto.managerId) {
        const mgr = await this.employeeRepo.findOne({ where: { id: dto.managerId } });
        if (!mgr) throw new BadRequestException('Manager not found');
        if (mgr.organizationId !== dto.organizationId) {
          throw new BadRequestException('Manager must belong to the same organization');
        }
      }

      const projectCode = dto.projectCode?.trim() || (await this.generateProjectCode());
      const project = this.projectRepo.create({
        ...dto,
        projectCode,
        status: dto.status || 'ACTIVE',
      });
      return this.projectRepo.save(project);
    };

    return saveProject();
  }

  findAll(organizationId: string, clientId?: string) {
    return this.projectRepo.find({
      where: {
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      relations: ['client', 'manager', 'manager.user', 'members', 'members.user'],
      order: { projectName: 'ASC' },
    });
  }

  async findOneForUser(
    id: string,
    userId: string,
    organizationId: string,
    isAdminOrManager = false,
  ) {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['client', 'manager', 'manager.user', 'members', 'members.user'],
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('Project does not belong to your organization');
    }

    if (isAdminOrManager) {
      return project;
    }

    const isManager = Boolean(project.manager?.userId && project.manager.userId === userId);
    const isMember = (project.members ?? []).some((member) => member.userId === userId);

    if (!isManager && !isMember) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.managerId) {
        const mgr = await this.employeeRepo.findOne({ where: { id: dto.managerId } });
        if (!mgr) throw new BadRequestException('Manager not found');
        if (mgr.organizationId !== project.organizationId) {
          throw new BadRequestException('Manager must belong to the same organization');
        }
    }
    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async remove(id: string) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return this.projectRepo.remove(project);
  }

  async updateCompletionByManager(id: string, userId: string, organizationId: string, completionPercent: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');

    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      select: ['id'],
    });
    if (!employee || project.managerId !== employee.id) {
      throw new NotFoundException('Project not found or you are not the manager');
    }

    project.completionPercent = Math.min(100, Math.max(0, completionPercent));
    return this.projectRepo.save(project);
  }

  async findManagedByUserId(userId: string, organizationId: string) {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      select: ['id', 'userId'],
    });

    // Backward-compatible lookup in case older rows were stored with employeeId
    // instead of userId in client_project_members.user_id.
    const membershipLookupIds = Array.from(
      new Set(
        [userId, employee?.userId, employee?.id].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );

    const memberProjectIds =
      membershipLookupIds.length > 0
        ? Array.from(
            new Set(
              (
                await this.memberRepo.find({
                  where: { userId: In(membershipLookupIds) },
                  select: ['projectId'],
                })
              ).map((member) => member.projectId),
            ),
          )
        : [];

    // Visible projects = projects managed by this user + projects assigned to this user.
    // Keep organization scoping strict.
    const query = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('project.manager', 'manager')
      .leftJoinAndSelect('manager.user', 'managerUser')
      .leftJoinAndSelect('project.members', 'projectMembers')
      .leftJoinAndSelect('projectMembers.user', 'projectMemberUser')
      .where('project.organizationId = :organizationId', { organizationId });

    if (employee?.id && memberProjectIds.length > 0) {
      query.andWhere(
        '(project.managerId = :managerId OR project.id IN (:...memberProjectIds))',
        { managerId: employee.id, memberProjectIds },
      );
    } else if (employee?.id) {
      query.andWhere('project.managerId = :managerId', { managerId: employee.id });
    } else if (memberProjectIds.length > 0) {
      query.andWhere('project.id IN (:...memberProjectIds)', { memberProjectIds });
    } else {
      return [];
    }

    return query.orderBy('project.projectName', 'ASC').getMany();
  }

  // ─── Employee Assignment ───────────────────────────────────────────────────

  async getProjectEmployees(projectId: string) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['manager', 'manager.user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
    });

    const employeesWithInfo = await Promise.all(
      members.map(async (m) => {
        const emp = await this.employeeRepo.findOne({
          where: project.organizationId
            ? [{ userId: m.userId, organizationId: project.organizationId }]
            : [{ userId: m.userId }],
          relations: ['manager', 'designation'],
        });
        return {
          userId: m.userId,
          role: m.role,
          assignedAt: m.assignedAt,
          employeeId: emp?.id ?? null,
          employeeCode: emp?.employeeCode ?? null,
          firstName: emp?.firstName ?? m.user?.firstName ?? '',
          lastName: emp?.lastName ?? m.user?.lastName ?? '',
          email: m.user?.email ?? '',
          workEmail: emp?.workEmail ?? '',
          designation: emp?.designation?.name ?? null,
          reportingTo: emp?.reportingTo ?? null,
          managerName: emp?.manager
            ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim() || emp.manager.workEmail
            : null,
        };
      }),
    );

    const managerEmployee = project.manager;
    const managerUserId = managerEmployee?.userId ?? null;
    const managerRecord = managerUserId
      ? {
          userId: managerUserId,
          role: 'manager',
          assignedAt: project.createdAt,
          employeeId: managerEmployee?.id ?? null,
          employeeCode: managerEmployee?.employeeCode ?? null,
          firstName: managerEmployee?.firstName ?? managerEmployee?.user?.firstName ?? '',
          lastName: managerEmployee?.lastName ?? managerEmployee?.user?.lastName ?? '',
          email: managerEmployee?.user?.email ?? managerEmployee?.workEmail ?? '',
          workEmail: managerEmployee?.workEmail ?? '',
          designation: null,
          reportingTo: managerEmployee?.reportingTo ?? null,
          managerName: null,
        }
      : null;

    const mergedByUserId = new Map<string, any>();
    if (managerRecord?.userId) {
      mergedByUserId.set(managerRecord.userId, managerRecord);
    }

    employeesWithInfo.forEach((row) => {
      const existing = mergedByUserId.get(row.userId);
      if (existing?.role === 'manager') {
        mergedByUserId.set(row.userId, {
          ...row,
          ...existing,
          role: 'manager',
          assignedAt: existing.assignedAt ?? row.assignedAt,
        });
        return;
      }
      mergedByUserId.set(row.userId, row);
    });

    const merged = Array.from(mergedByUserId.values());
    merged.sort((a, b) => {
      if (a.role === 'manager' && b.role !== 'manager') return -1;
      if (a.role !== 'manager' && b.role === 'manager') return 1;
      return String(a.firstName ?? '').localeCompare(String(b.firstName ?? ''));
    });

    return merged;
  }

  async assignEmployees(
    projectId: string,
    assignmentsOrUserIds: AssignEmployeeInput[] | string[],
    requestingUserId: string,
    organizationId: string,
    isAdmin = false,
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

    for (const assignment of assignableAssignments) {
      const userId = assignment.userId;
      const nextRole = this.sanitizeProjectMemberRole(assignment.role);
      const exists = await this.memberRepo.findOne({ where: { projectId, userId } });
      if (!exists) {
        await this.memberRepo.save(
          this.memberRepo.create({ projectId, userId, role: nextRole }),
        );
      } else {
        exists.role = nextRole;
        await this.memberRepo.save(exists);
      }
    }

    // Send notification to newly assigned employees
    await this.sendAssignmentNotification(
      project,
      assignableUserIds,
      requestingUserId,
      organizationId,
    );

    return this.getProjectEmployees(projectId);
  }

  private async sendAssignmentNotification(
    project: ClientProject,
    userIds: string[],
    requestingUserId: string,
    organizationId: string,
  ) {
    try {
      // Filter out the requestingUserId to ensure they don't receive their own notification
      const filteredRecipientIds = userIds.filter((id) => id !== requestingUserId);
      if (filteredRecipientIds.length === 0) {
        return; // No recipients to notify
      }
      await this.messageService.createMessage(requestingUserId, {
        organizationId,
        recipientUserIds: filteredRecipientIds,
        title: `Assigned to Project: ${project.projectName}`,
        body: `You have been assigned to the project "${project.projectName}".\n\nProject Description: ${project.description || 'No description provided'}\n\nPlease check the project details and start working on it.`,
        type: 'project_assignment',
      });
    } catch (error) {
      console.error('Failed to send assignment notification:', error);
    }
  }

  async removeEmployee(projectId: string, userId: string) {
    const member = await this.memberRepo.findOne({ where: { projectId, userId } });
    if (!member) throw new NotFoundException('Employee not found in this project');
    await this.memberRepo.remove(member);
    return { success: true };
  }

  // ─── Task Management ───────────────────────────────────────────────────────────────

  async createTask(
    projectId: string,
    data: {
      title: string;
      description?: string;
      assignedToUserId?: string;
      assignedByUserId: string;
      organizationId: string;
      dueDate?: string;
      priority?: TaskPriority;
    },
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const actingEmployee = await this.employeeRepo.findOne({
      where: {
        userId: data.assignedByUserId,
        organizationId: data.organizationId,
      },
      select: ['id'],
    });
    if (!actingEmployee || project.managerId !== actingEmployee.id) {
      throw new ForbiddenException('Only the assigned project manager can create tasks');
    }

    if (data.assignedToUserId) {
      const [memberRecord, managerEmployee] = await Promise.all([
        this.memberRepo.findOne({
          where: { projectId, userId: data.assignedToUserId },
          select: ['id'],
        }),
        project.managerId
          ? this.employeeRepo.findOne({
              where: { id: project.managerId },
              select: ['userId'],
            })
          : Promise.resolve(null),
      ]);

      const isAssignedManager = Boolean(
        managerEmployee?.userId && managerEmployee.userId === data.assignedToUserId,
      );
      if (!memberRecord && !isAssignedManager) {
        throw new ForbiddenException('Task can be assigned only to project members');
      }
    }

    const task = this.taskRepo.create({
      projectId,
      title: data.title,
      description: data.description || null,
      assignedToUserId: data.assignedToUserId || null,
      assignedByUserId: data.assignedByUserId,
      dueDate: data.dueDate || null,
      priority: data.priority || TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
    });

    const savedTask = await this.taskRepo.save(task);

    // Send notification if task is assigned to an employee
    if (data.assignedToUserId) {
      await this.sendTaskAssignmentNotification(
        project,
        savedTask,
        data.assignedToUserId,
        data.assignedByUserId,
        data.organizationId,
      );
    }

    return savedTask;
  }

  private async sendTaskAssignmentNotification(
    project: ClientProject,
    task: ProjectTask,
    assignedToUserId: string,
    assignedByUserId: string,
    organizationId: string,
  ) {
    try {
      // Don't send notification if assigning to yourself
      if (assignedToUserId === assignedByUserId) {
        return;
      }
      const dueDateText = task.dueDate
        ? `\nDue Date: ${new Date(task.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
        : '';
      const priorityText = `\nPriority: ${task.priority || 'Medium'}`;

      await this.messageService.createMessage(assignedByUserId, {
        organizationId,
        recipientUserIds: [assignedToUserId],
        title: `New Task Assigned: ${task.title}`,
        body: `You have been assigned a new task for project "${project.projectName}".\n\nTask: ${task.title}\nDescription: ${task.description || 'No description'}${dueDateText}${priorityText}\n\nPlease check your tasks and start working on it.`,
        type: 'task_assignment',
      });
    } catch (error) {
      console.error('Failed to send task assignment notification:', error);
    }
  }

  async getProjectTasks(projectId: string) {
    const tasks = await this.taskRepo.find({
      where: { projectId },
      relations: ['assignedToUser', 'assignedByUser'],
      order: { createdAt: 'DESC' },
    });
    return tasks;
  }

  async getMyAssignedTasks(userId: string, organizationId: string) {
    // Get tasks assigned to this user across all projects in the organization
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
    });
    if (!employee) return [];

    // Also get tasks via project membership
    const memberProjectIds = await this.memberRepo
      .find({
        where: { userId },
        select: ['projectId'],
      })
      .then((members) => members.map((m) => m.projectId));

    const tasks = await this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignedToUser', 'assignedToUser')
      .leftJoinAndSelect('task.assignedByUser', 'assignedByUser')
      .where('task.assigned_to_user_id = :userId', { userId })
      .andWhere('project.organization_id = :organizationId', { organizationId })
      .orderBy('task.createdAt', 'DESC')
      .getMany();

    return tasks;
  }

  async updateTaskStatus(
    taskId: string,
    userId: string,
    status: TaskStatus,
  ) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['project'],
    });
    if (!task) throw new NotFoundException('Task not found');

    // Only assigned user or project manager can update status
    if (task.assignedToUserId !== userId) {
      const employee = await this.employeeRepo.findOne({
        where: { userId, organizationId: task.project.organizationId },
      });
      if (employee?.id !== task.project.managerId) {
        throw new ForbiddenException('You cannot update this task');
      }
    }

    task.status = status;
    if (status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
    } else {
      task.completedAt = null;
    }

    return this.taskRepo.save(task);
  }

  async deleteTask(taskId: string, userId: string, organizationId: string) {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
      relations: ['project'],
    });
    if (!task) throw new NotFoundException('Task not found');

    // Only assigned user or project manager can delete
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
    });
    if (
      task.assignedByUserId !== userId &&
      task.assignedToUserId !== userId &&
      employee?.id !== task.project.managerId
    ) {
      throw new ForbiddenException('You cannot delete this task');
    }

    await this.taskRepo.remove(task);
    return { success: true };
  }

  async getTimesheetsSummary(projectId: string) {
    // Get project by ID to get project name and cost info
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectName = project.projectName;
    const projectCost = project.projectCost ?? 0;
    const hourlyRate = project.hourlyRate ?? 0;

    // Query timesheets where project_name matches
    const timesheets = await this.timesheetRepo
      .createQueryBuilder('ts')
      .where('ts.project_name = :projectName', { projectName })
      .getMany();

    // Calculate summary
    const totalMinutes = timesheets.reduce((sum, ts) => sum + (ts.workingMinutes || 0), 0);
    const totalHours = totalMinutes / 60;
    const actualCost = hourlyRate > 0 ? totalHours * hourlyRate : 0;
    const profitLoss = projectCost - actualCost;
    const isProfit = profitLoss >= 0;

    // Get unique employee count
    const uniqueEmployeeIds = new Set(timesheets.map(ts => ts.employeeId));
    const employeeCount = uniqueEmployeeIds.size;

    return {
      projectId,
      projectName,
      projectCost,
      hourlyRate,
      totalHours: Math.round(totalHours * 100) / 100,
      totalMinutes,
      employeeCount,
      actualCost: Math.round(actualCost * 100) / 100,
      profitLoss: Math.round(Math.abs(profitLoss) * 100) / 100,
      isProfit,
      timesheetCount: timesheets.length,
    };
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

  private async resolveClientProjectMemberUserId(
    projectId: string,
    organizationId: string,
    value?: string | null,
  ) {
    const normalizedIdentifier = String(value ?? '').trim();
    if (!normalizedIdentifier) return null;

    const lookupIds = new Set<string>([normalizedIdentifier]);
    const employee = await this.employeeRepo.findOne({
      where: [
        { userId: normalizedIdentifier, organizationId },
        { id: normalizedIdentifier, organizationId },
      ],
      select: ['id', 'userId'],
    });
    if (employee?.id) lookupIds.add(employee.id);
    if (employee?.userId) lookupIds.add(employee.userId);

    const lookupList = Array.from(lookupIds);
    const member = await this.memberRepo.findOne({
      where: {
        projectId,
        userId: In(lookupList),
      },
    });
    if (member) return member.userId;

    const project = await this.projectRepo.findOne({
      where: { id: projectId, organizationId },
      relations: ['manager'],
    });
    const managerUserId = project?.manager?.userId;
    if (managerUserId && lookupIds.has(managerUserId)) {
      return managerUserId;
    }

    throw new BadRequestException('Selected user must belong to this project');
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
        projectSource: 'client',
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
            projectSource: 'client',
            tabId: payload.tabId ?? null,
            testCaseId: payload.testCaseId ?? null,
            fieldName: payload.fieldName ?? null,
            beforeValue: payload.beforeValue ?? null,
            afterValue: payload.afterValue ?? null,
          },
        });
      }
    } catch (error) {
      console.error('Failed to write client test sheet log report', error);
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

  private async ensureClientProjectAccess(
    projectId: string,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    return this.findOneForUser(projectId, userId, organizationId, isAdmin);
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
        projectSource: 'client',
      },
    });
    if (count > 0) return;

    const tab = await this.testSheetTabRepo.save(
      this.testSheetTabRepo.create({
        projectId,
        projectSource: 'client',
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
    projectSource: ProjectTestSheetSource = 'client',
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
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);
    await this.ensureDefaultTestSheetTab(projectId, organizationId, userId);
    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async updateTestSheetColumnHeaders(
    projectId: string,
    columnHeaders: Record<string, unknown>,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    const project = await this.ensureClientProjectAccess(
      projectId,
      userId,
      organizationId,
      isAdmin,
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

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async createTestSheetTab(
    projectId: string,
    dto: CreateProjectTestSheetTabDto,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);

    const requestedName = this.sanitizeTestSheetText(dto.name, 120);
    if (!requestedName) {
      throw new BadRequestException('Tab name is required');
    }

    const existingTabs = await this.testSheetTabRepo.find({
      where: { projectId, organizationId, projectSource: 'client' },
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
        projectSource: 'client',
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

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async updateTestSheetTab(
    projectId: string,
    tabId: string,
    dto: UpdateProjectTestSheetTabDto,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);

    const tab = await this.testSheetTabRepo.findOne({
      where: {
        id: tabId,
        projectId,
        organizationId,
        projectSource: 'client',
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
        where: { projectId, organizationId, projectSource: 'client' },
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

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async createTestCase(
    projectId: string,
    tabId: string,
    dto: CreateProjectTestCaseDto,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);

    const tab = await this.testSheetTabRepo.findOne({
      where: { id: tabId, projectId, organizationId, projectSource: 'client' },
    });
    if (!tab) {
      throw new NotFoundException('Test sheet tab not found');
    }

    const title = this.sanitizeTestSheetText(dto.title, 250);

    const [qaUserId, developerUserId] = await Promise.all([
      this.resolveClientProjectMemberUserId(projectId, organizationId, dto.qaUserId),
      this.resolveClientProjectMemberUserId(
        projectId,
        organizationId,
        dto.developerUserId,
      ),
    ]);

    const lastRow = await this.testSheetCaseRepo
      .createQueryBuilder('row')
      .where('row.projectId = :projectId', { projectId })
      .andWhere('row.organizationId = :organizationId', { organizationId })
      .andWhere('row.projectSource = :projectSource', { projectSource: 'client' })
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
        projectSource: 'client',
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

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async updateTestCase(
    projectId: string,
    testCaseId: string,
    dto: UpdateProjectTestCaseDto,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);

    const testCase = await this.testSheetCaseRepo.findOne({
      where: {
        id: testCaseId,
        projectId,
        organizationId,
        projectSource: 'client',
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
      testCase.title = this.sanitizeTestSheetText(dto.title, 250);
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
      testCase.qaUserId = await this.resolveClientProjectMemberUserId(
        projectId,
        organizationId,
        dto.qaUserId,
      );
    }
    if (dto.developerUserId !== undefined) {
      testCase.developerUserId = await this.resolveClientProjectMemberUserId(
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

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }

  async deleteTestCase(
    projectId: string,
    testCaseId: string,
    userId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    await this.ensureClientProjectAccess(projectId, userId, organizationId, isAdmin);

    const testCase = await this.testSheetCaseRepo.findOne({
      where: {
        id: testCaseId,
        projectId,
        organizationId,
        projectSource: 'client',
      },
    });
    if (!testCase) {
      throw new NotFoundException('Test case not found');
    }

    const beforeSnapshot = this.serializeTestCase(testCase);
    await this.testSheetCaseRepo.remove(testCase);

    await this.testSheetCaseRepo
      .createQueryBuilder()
      .update(ProjectTestSheetCase)
      .set({ rowIndex: () => '"row_index" - 1' })
      .where('project_id = :projectId', { projectId })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('project_source = :projectSource', { projectSource: 'client' })
      .andWhere('tab_id = :tabId', { tabId: testCase.tabId })
      .andWhere('row_index > :rowIndex', { rowIndex: beforeSnapshot.rowIndex })
      .execute();

    await this.createTestSheetChangeLog({
      projectId,
      organizationId,
      changedByUserId: userId,
      action: 'test_case_deleted',
      tabId: testCase.tabId,
      testCaseId,
      fieldName: 'testCase',
      summary: `Deleted test case "${beforeSnapshot.title || '(untitled)'}"`,
      beforeValue: beforeSnapshot,
      afterValue: null,
    });

    return this.buildTestSheetResponse(projectId, organizationId, 'client');
  }
}
