import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Employee } from '../employee/entities/employee.entity';

type OrgEmployeeFilters = {
  search?: string;
  designationId?: string;
  limit?: number;
};

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private memberRepo: Repository<ProjectMember>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
  ) {}

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
      const exists = await this.memberRepo.findOne({ where: { projectId, userId } });
      if (!exists) {
        await this.memberRepo.save(this.memberRepo.create({ projectId, userId, role: 'member' }));
      }
    }

    return this.findOne(projectId);
  }

  async removeMember(projectId: string, userId: string) {
    const member = await this.memberRepo.findOne({ where: { projectId, userId } });
    if (!member) throw new NotFoundException('Member not found in this project');
    await this.memberRepo.remove(member);
    return { success: true };
  }

  // ── Employee ────────────────────────────────────────────────────────────────

  async findMyProjects(userId: string) {
    const memberships = await this.memberRepo
      .createQueryBuilder('pm')
      .leftJoinAndSelect('pm.project', 'p')
      .leftJoinAndSelect('p.createdBy', 'creator')
      .leftJoinAndSelect('p.members', 'allMembers')
      .leftJoinAndSelect('allMembers.user', 'u')
      .where('pm.userId = :userId', { userId })
      .orderBy('p.createdAt', 'DESC')
      .getMany();

    return memberships.map((m) => this.formatProject(m.project));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

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

  async getProjectEmployees(projectId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    // Get all employees assigned to this project via ProjectMember
    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
    });

    // For each member, get their employee record to get reportingTo info
    const employeesWithInfo = await Promise.all(
      members.map(async (m) => {
        const emp = await this.employeeRepo.findOne({
          where: { userId: m.userId },
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
          managerName: emp?.manager ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim() || emp.manager.workEmail : null,
        };
      }),
    );

    return employeesWithInfo;
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

    // Assign each employee to the project
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
