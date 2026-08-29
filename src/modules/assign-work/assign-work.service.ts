import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ProjectTask,
  TaskPriority,
  TaskStatus,
} from '../clients/entities/project-task.entity';
import { ClientProject } from '../clients/entities/project.entity';
import { ProjectIssue } from '../project/entities/project-issue.entity';
import { Project } from '../project/entities/project.entity';
import { Employee } from '../employee/entities/employee.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { MessageService } from '../message/message.service';
import { MessageGateway } from '../message/message.gateway';
import { FirebaseService } from '../firebase/firebase.service';
import {
  CreateAssignWorkDto,
  UpdateWorkProgressDto,
  WorkSource,
} from './dto/create-assign-work.dto';

export interface WorkAssignment {
  id: string;
  type: 'client' | 'internal';
  projectId: string | null;
  projectName: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progressPercent: number;
  workReport: string | null;
  imageUrl: string | null;
  dueDate: string | null;
  assignedToUserId: string | null;
  assignedByUserId: string;
  assignedToUser: { id: string; firstName: string; lastName: string } | null;
  assignedByUser: { id: string; firstName: string; lastName: string } | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

@Injectable()
export class AssignWorkService {
  private readonly logger = new Logger(AssignWorkService.name);

  constructor(
    @InjectRepository(ProjectTask)
    private readonly taskRepo: Repository<ProjectTask>,
    @InjectRepository(ClientProject)
    private readonly clientProjectRepo: Repository<ClientProject>,
    @InjectRepository(ProjectIssue)
    private readonly issueRepo: Repository<ProjectIssue>,
    @InjectRepository(Project)
    private readonly internalProjectRepo: Repository<Project>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(UserPushToken)
    private readonly pushTokenRepo: Repository<UserPushToken>,
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  private hasAnyRole(user: JwtPayload, roles: string[]) {
    const allowed = new Set(roles.map((r) => r.toUpperCase()));
    return (
      user.roles?.some((roleEntry) =>
        allowed.has(String(roleEntry?.roleName ?? '').toUpperCase()),
      ) ?? false
    );
  }

  private isAdmin(user: JwtPayload) {
    return this.hasAnyRole(user, [
      'ADMIN',
      'SUPER_ADMIN',
      'ORG_ADMIN',
      'MANAGER',
      'HR',
    ]);
  }

  private toUserSummary(
    user?: { id?: string; firstName?: string; lastName?: string } | null,
  ) {
    if (!user) return null;
    return {
      id: user.id || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
    };
  }

  // ─── Options (dropdown data for the Assign Work form) ────────────────────────────
  async getOptions(organizationId: string) {
    const [clientProjects, internalProjects, employees] = await Promise.all([
      this.clientProjectRepo.find({
        where: { organizationId },
        select: ['id', 'projectName'],
      }),
      this.internalProjectRepo.find({
        where: { organizationId },
        select: ['id', 'name'],
      }),
      this.employeeRepo.find({
        where: { organizationId },
      }),
    ]);

    const projects = [
      ...clientProjects.map((p) => ({
        id: p.id,
        name: p.projectName,
        source: 'client' as const,
      })),
      ...internalProjects.map((p) => ({
        id: p.id,
        name: p.name,
        source: 'internal' as const,
      })),
    ];

    const employeeList = employees
      .filter((e) => e.userId)
      .map((e) => ({
        userId: e.userId,
        firstName: e.firstName,
        lastName: e.lastName || '',
      }));

    return { projects, employees: employeeList };
  }

  // ─── Create ──────────────────────────────────────────────────────────────────────
  async create(
    assignedByUserId: string,
    organizationId: string,
    dto: CreateAssignWorkDto,
  ) {
    const assigneeIds = [
      ...new Set(
        dto.assignedToUserIds?.length
          ? dto.assignedToUserIds
          : dto.assignedToUserId
            ? [dto.assignedToUserId]
            : [],
      ),
    ];
    if (!assigneeIds.length) {
      throw new BadRequestException('Assign the work to at least one employee');
    }

    const employees = await this.employeeRepo.find({
      where: { userId: In(assigneeIds), organizationId },
      select: ['id', 'userId'],
    });
    const validIds = new Set(employees.map((e) => e.userId));
    const missing = assigneeIds.filter((id) => !validIds.has(id));
    if (missing.length) {
      throw new BadRequestException(
        'One or more assignees are not employees of this organization',
      );
    }

    let projectName = '';
    let type: WorkSource = WorkSource.CLIENT;

    if (dto.projectId) {
      if (dto.source === WorkSource.INTERNAL) {
        const project = await this.internalProjectRepo.findOne({
          where: { id: dto.projectId },
          select: ['id', 'name', 'organizationId'],
        });
        if (!project || project.organizationId !== organizationId) {
          throw new BadRequestException('Project not found');
        }
        projectName = project.name;
        type = WorkSource.INTERNAL;
      } else {
        const project = await this.clientProjectRepo.findOne({
          where: { id: dto.projectId },
          select: ['id', 'projectName', 'organizationId'],
        });
        if (!project || project.organizationId !== organizationId) {
          throw new BadRequestException('Project not found');
        }
        projectName = project.projectName;
        type = WorkSource.CLIENT;
      }
    }

    const created: (ProjectTask | ProjectIssue)[] = [];
    for (const assigneeUserId of assigneeIds) {
      const saved = await this.createForAssignee({
        assignedByUserId,
        assignedToUserId: assigneeUserId,
        organizationId,
        dto,
        type,
        projectName,
      });
      created.push(saved);
    }
    return created;
  }

  private async createForAssignee(params: {
    assignedByUserId: string;
    assignedToUserId: string;
    organizationId: string;
    dto: CreateAssignWorkDto;
    type: WorkSource;
    projectName: string;
  }): Promise<ProjectTask | ProjectIssue> {
    const {
      assignedByUserId,
      assignedToUserId,
      organizationId,
      dto,
      type,
      projectName,
    } = params;

    if (type === WorkSource.INTERNAL) {
      const issue = this.issueRepo.create({
        organizationId,
        projectId: dto.projectId,
        pageName: dto.otherProjectName || 'General',
        issueTitle: dto.title,
        description: dto.description || null,
        imageUrl: dto.imageUrl || null,
        status: 'pending',
        createdByUserId: assignedByUserId,
        assigneeUserId: assignedToUserId,
      });
      const saved = await this.issueRepo.save(issue);
      await this.notifyAssignee({
        assignedByUserId,
        assignedToUserId,
        organizationId,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate,
        priority: dto.priority,
        projectName,
        workId: saved.id,
      });
      return saved;
    }

    const task = this.taskRepo.create({
      projectId: dto.projectId || null,
      organizationId: dto.projectId ? undefined : organizationId,
      otherProjectName: dto.projectId ? null : dto.otherProjectName || null,
      title: dto.title,
      description: dto.description || null,
      assignedToUserId,
      assignedByUserId,
      dueDate: dto.dueDate || null,
      priority: (dto.priority || 'medium') as TaskPriority,
      imageUrl: dto.imageUrl || null,
      status: TaskStatus.PENDING,
    });
    const savedTask = await this.taskRepo.save(task);
    await this.notifyAssignee({
      assignedByUserId,
      assignedToUserId,
      organizationId,
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      priority: dto.priority,
      projectName,
      workId: savedTask.id,
    });
    return savedTask;
  }

  // ─── List ─────────────────────────────────────────────────────────────────────────
  async listAll(organizationId: string): Promise<WorkAssignment[]> {
    const [tasks, issues] = await Promise.all([
      this.taskRepo
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.assignedToUser', 'assignedToUser')
        .leftJoinAndSelect('task.assignedByUser', 'assignedByUser')
        .leftJoinAndSelect('task.project', 'project')
        .where(
          'CAST(task.organization_id AS uuid) = :organizationId OR CAST(project.organization_id AS uuid) = :organizationId',
          { organizationId },
        )
        .getMany(),
      this.issueRepo.find({
        where: { organizationId },
        relations: ['project'],
      }),
    ]);

    const [clientProjects, internalProjects] = await Promise.all([
      this.clientProjectRepo.find({
        where: { organizationId },
        select: ['id', 'projectName'],
      }),
      this.internalProjectRepo.find({
        where: { organizationId },
        select: ['id', 'name'],
      }),
    ]);
    const clientNameMap = new Map(
      clientProjects.map((p) => [p.id, p.projectName]),
    );
    const internalNameMap = new Map(
      internalProjects.map((p) => [p.id, p.name]),
    );

    const assignments: WorkAssignment[] = tasks.map((task) => ({
      id: task.id,
      type: 'client' as const,
      projectId: task.projectId,
      projectName: task.project
        ? (clientNameMap.get(task.project.id) ?? task.project.projectName ?? '')
        : task.otherProjectName || '',
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority || 'medium',
      progressPercent: task.progressPercent || 0,
      workReport: task.workReport,
      imageUrl: task.imageUrl,
      dueDate: task.dueDate,
      assignedToUserId: task.assignedToUserId,
      assignedByUserId: task.assignedByUserId,
      assignedToUser: this.toUserSummary(task.assignedToUser),
      assignedByUser: this.toUserSummary(task.assignedByUser),
      completedAt: task.completedAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

    for (const issue of issues) {
      assignments.push({
        id: issue.id,
        type: 'internal' as const,
        projectId: issue.projectId,
        projectName: issue.project
          ? (internalNameMap.get(issue.project.id) ?? issue.project.name ?? '')
          : '',
        title: issue.issueTitle,
        description: issue.description,
        status: issue.status,
        priority: 'medium',
        progressPercent: issue.progressPercent || 0,
        workReport: issue.workReport,
        imageUrl: issue.imageUrl,
        dueDate: null,
        assignedToUserId: issue.assigneeUserId,
        assignedByUserId: issue.createdByUserId,
        assignedToUser: null,
        assignedByUser: null,
        completedAt: issue.resolvedAt,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      });
    }

    assignments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return assignments;
  }

  async getMy(organizationId: string, userId: string) {
    const all = await this.listAll(organizationId);
    return all.filter((a) => a.assignedToUserId === userId);
  }

  async getByMe(organizationId: string, userId: string) {
    const all = await this.listAll(organizationId);
    return all.filter((a) => a.assignedByUserId === userId);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────────
  async updateProgress(
    user: JwtPayload,
    organizationId: string,
    workId: string,
    dto: UpdateWorkProgressDto,
  ) {
    if (dto.source === WorkSource.INTERNAL) {
      return this.updateInternal(user, organizationId, workId, dto);
    }
    return this.updateClient(user, organizationId, workId, dto);
  }

  private async updateClient(
    user: JwtPayload,
    organizationId: string,
    workId: string,
    dto: UpdateWorkProgressDto,
  ) {
    const task = await this.taskRepo.findOne({
      where: { id: workId },
      relations: ['project'],
    });
    if (!task) throw new NotFoundException('Assignment work not found');
    const taskOrg = task.organizationId || task.project?.organizationId;
    if (taskOrg !== organizationId)
      throw new ForbiddenException('Access denied');

    const isAssignee = task.assignedToUserId === user.userId;
    const isAssigner = task.assignedByUserId === user.userId;
    if (!isAssignee && !isAssigner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'Only the assignee, assigner or an admin can update this work',
      );
    }

    const wasDone =
      task.status === TaskStatus.COMPLETED || task.progressPercent >= 100;
    if (dto.status !== undefined) task.status = dto.status as TaskStatus;
    if (dto.progressPercent !== undefined)
      task.progressPercent = dto.progressPercent;
    if (dto.workReport !== undefined) task.workReport = dto.workReport;

    const isDone =
      task.status === TaskStatus.COMPLETED || task.progressPercent >= 100;
    if (isDone) {
      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
    } else {
      task.completedAt = null;
    }

    const saved = await this.taskRepo.save(task);

    if (isDone && !wasDone && task.assignedByUserId !== user.userId) {
      await this.notify({
        senderUserId: user.userId,
        recipientUserId: task.assignedByUserId,
        organizationId,
        type: 'work_completed',
        title: `Work Completed: ${task.title}`,
        body: `Work "${task.title}" was marked completed (${task.progressPercent}%).${
          task.workReport ? `\nUpdate: ${task.workReport}` : ''
        }`,
        data: { workId: task.id, projectName: task.project?.projectName || '' },
      });
    }

    return {
      id: saved.id,
      type: 'client' as const,
      status: saved.status,
      progressPercent: saved.progressPercent,
      workReport: saved.workReport,
      completedAt: saved.completedAt,
    };
  }

  private async updateInternal(
    user: JwtPayload,
    organizationId: string,
    workId: string,
    dto: UpdateWorkProgressDto,
  ) {
    const issue = await this.issueRepo.findOne({ where: { id: workId } });
    if (!issue) throw new NotFoundException('Assignment work not found');
    if (issue.organizationId !== organizationId)
      throw new ForbiddenException('Access denied');

    const isAssignee = issue.assigneeUserId === user.userId;
    const isAssigner = issue.createdByUserId === user.userId;
    if (!isAssignee && !isAssigner && !this.isAdmin(user)) {
      throw new ForbiddenException(
        'Only the assignee, assigner or an admin can update this work',
      );
    }

    const wasDone = issue.status === 'resolved' || issue.progressPercent >= 100;
    if (dto.status !== undefined) {
      issue.status = dto.status === 'resolved' ? 'resolved' : 'pending';
    }
    if (dto.progressPercent !== undefined)
      issue.progressPercent = dto.progressPercent;
    if (dto.workReport !== undefined) issue.workReport = dto.workReport;

    const isDone = issue.status === 'resolved' || issue.progressPercent >= 100;
    issue.status = isDone ? 'resolved' : 'pending';
    issue.resolvedAt = isDone ? new Date() : null;

    const saved = await this.issueRepo.save(issue);

    if (isDone && !wasDone && issue.createdByUserId !== user.userId) {
      await this.notify({
        senderUserId: user.userId,
        recipientUserId: issue.createdByUserId,
        organizationId,
        type: 'work_completed',
        title: `Work Completed: ${issue.issueTitle}`,
        body: `Work "${issue.issueTitle}" was marked completed (${issue.progressPercent}%).${
          issue.workReport ? `\nUpdate: ${issue.workReport}` : ''
        }`,
        data: { workId: issue.id, projectName: '' },
      });
    }

    return {
      id: saved.id,
      source: 'internal' as const,
      status: saved.status,
      progressPercent: saved.progressPercent,
      workReport: saved.workReport,
      completedAt: saved.resolvedAt,
    };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────────
  async remove(
    user: JwtPayload,
    organizationId: string,
    workId: string,
    source?: WorkSource,
  ) {
    if (source === WorkSource.INTERNAL) {
      const issue = await this.issueRepo.findOne({ where: { id: workId } });
      if (!issue) throw new NotFoundException('Assignment work not found');
      if (issue.organizationId !== organizationId)
        throw new ForbiddenException('Access denied');
      if (!this.canDelete(user, issue.createdByUserId, issue.assigneeUserId)) {
        throw new ForbiddenException('You cannot delete this assignment');
      }
      await this.issueRepo.remove(issue);
    } else {
      const task = await this.taskRepo.findOne({ where: { id: workId } });
      if (!task) throw new NotFoundException('Assignment work not found');
      const project = task.projectId
        ? await this.clientProjectRepo.findOne({
            where: { id: task.projectId },
          })
        : null;
      const taskOrg = task.organizationId || project?.organizationId;
      if (taskOrg !== organizationId)
        throw new ForbiddenException('Access denied');
      if (!this.canDelete(user, task.assignedByUserId, task.assignedToUserId)) {
        throw new ForbiddenException('You cannot delete this assignment');
      }
      await this.taskRepo.remove(task);
    }
    return { success: true };
  }

  private canDelete(
    user: JwtPayload,
    assignerId: string | null,
    assigneeId: string | null,
  ) {
    if (this.isAdmin(user)) return true;
    if (user.userId === assigneeId || user.userId === assignerId) return true;
    return false;
  }

  // ─── Notifications (in-app + socket + FCM push) ──────────────────────────────────
  private async notifyAssignee(params: {
    assignedByUserId: string;
    assignedToUserId: string;
    organizationId: string;
    title: string;
    description?: string;
    dueDate?: string;
    priority?: string;
    projectName: string;
    workId: string;
  }) {
    const {
      assignedByUserId,
      assignedToUserId,
      organizationId,
      title,
      description,
      dueDate,
      priority,
      projectName,
      workId,
    } = params;

    if (!assignedToUserId || assignedToUserId === assignedByUserId) return;

    const dueText = dueDate
      ? `\nDue Date: ${new Date(dueDate).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })}`
      : '';
    const priorityText = priority ? `\nPriority: ${priority}` : '';
    const projectText = projectName ? ` under "${projectName}"` : '';

    await this.notify({
      senderUserId: assignedByUserId,
      recipientUserId: assignedToUserId,
      organizationId,
      type: 'work_assignment',
      title: `New Work Assigned: ${title}`,
      body: `You have been assigned new work${projectText}.\n\nTask: ${title}\nDescription: ${
        description || 'No description'
      }${dueText}${priorityText}\n\nPlease open Assign Work to start working on it.`,
      data: { workId, projectName },
    });
  }

  private async notify(params: {
    senderUserId: string;
    recipientUserId: string;
    organizationId: string;
    type: 'work_assignment' | 'work_completed';
    title: string;
    body: string;
    data: Record<string, string>;
  }) {
    const {
      senderUserId,
      recipientUserId,
      organizationId,
      type,
      title,
      body,
      data,
    } = params;

    try {
      const result = await this.messageService.createMessage(senderUserId, {
        organizationId,
        recipientUserIds: [recipientUserId],
        title,
        body,
        type,
      });
      this.messageGateway.emitToUsers(result.recipientUserIds || [], {
        message: result.message,
      });
    } catch (err) {
      this.logger.error('Failed to create in-app work notification:', err);
    }

    try {
      const tokens = await this.pushTokenRepo.find({
        where: { userId: recipientUserId },
        select: ['token'],
      });
      const tokenList = tokens.map((t) => t.token);
      if (!tokenList.length) return;
      const { invalidTokens } = await this.firebaseService.sendToTokens(
        tokenList,
        {
          title,
          body,
          data: { type, ...data },
        },
      );
      if (invalidTokens.length) {
        await this.pushTokenRepo.delete({ token: In(invalidTokens) });
      }
    } catch (err) {
      this.logger.error('Failed to send work-assignment push:', err);
    }
  }
}
