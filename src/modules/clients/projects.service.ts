import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientProject } from './entities/project.entity';
import { ClientProjectMember } from './entities/client-project-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Injectable()
export class ProjectsService implements OnModuleInit {
  constructor(
    @InjectRepository(ClientProject)
    private projectRepo: Repository<ClientProject>,
    @InjectRepository(ClientProjectMember)
    private memberRepo: Repository<ClientProjectMember>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
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
      relations: ['client', 'manager', 'manager.user'],
      order: { projectName: 'ASC' },
    });
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
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const members = await this.memberRepo.find({
      where: { projectId },
      relations: ['user'],
    });

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
          managerName: emp?.manager
            ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim() || emp.manager.workEmail
            : null,
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
}
