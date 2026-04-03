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
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Timesheet)
    private timesheetRepo: Repository<Timesheet>,
  ) {}

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
    userIds: string[],
    requestingUserId: string,
    organizationId: string,
    isAdmin = false,
  ) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.organizationId !== organizationId) {
      throw new ForbiddenException('You cannot assign employees to this project');
    }

    const normalizedUserIds = Array.from(
      new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean)),
    );
    const assignableUserIds = normalizedUserIds.filter(
      (userId) => userId !== requestingUserId,
    );
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

    for (const userId of assignableUserIds) {
      const exists = await this.memberRepo.findOne({ where: { projectId, userId } });
      if (!exists) {
        await this.memberRepo.save(
          this.memberRepo.create({ projectId, userId, role: 'member' }),
        );
      }
    }

    return this.getProjectEmployees(projectId);
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

    return this.taskRepo.save(task);
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
}
