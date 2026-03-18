import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import {
  CreateRoleDto,
  AssignRoleDto,
  AssignDefaultRoleToOrgDto,
} from '../dto/roles.dto';
import { RoleType } from '../enums/role-type.enum';
import { OrganizationRole } from '../entities/organization-role.entity';

@Injectable()
export class RolesService {
  private static readonly DEFAULT_ORG_ROLES: Array<{
    roleName: string;
    description: string;
  }> = [
    { roleName: 'ADMIN', description: 'System administrator' },
    { roleName: 'HR', description: 'Human resources role' },
    { roleName: 'EMPLOYEE', description: 'Default employee role' },
  ];

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,

    @InjectRepository(OrganizationRole)
    private readonly organizationRoleRepo: Repository<OrganizationRole>,
  ) {}

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const { type = RoleType.CUSTOM, organizationId } = dto;

    if (type === RoleType.DEFAULT && organizationId) {
      throw new BadRequestException(
        'Default roles should not have an organizationId.',
      );
    }

    if (type === RoleType.CUSTOM && !organizationId) {
      throw new BadRequestException(
        'Custom roles must have an organizationId.',
      );
    }

    const role = this.roleRepo.create(dto);
    return this.roleRepo.save(role);
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepo.find({
      relations: ['rolePermissions', 'rolePermissions.permission'],
      order: { roleName: 'ASC' },
    });
  }

  async findById(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });

    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async assignRoleToUser(dto: AssignRoleDto): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const roles = await this.roleRepo.findBy({ id: In(dto.roleIds) });
    if (!roles.length) {
      throw new NotFoundException(
        'No valid roles found for the provided roleIds',
      );
    }

    // Optional: check org match or if default roles are allowed for that user

    //await this.userRoleRepo.delete({ user: { id: dto.userId } });

    const userRoles = roles.map((role) =>
      this.userRoleRepo.create({
        user,
        role,
        assignedBy: dto.assignedBy || dto.userId,
        isActive: true,
      }),
    );

    await this.userRoleRepo.save(userRoles);

    const updatedUser = await this.userRepo.findOne({
      where: { id: dto.userId },
      relations: ['userRoles', 'userRoles.role'],
    });

    if (!updatedUser)
      throw new NotFoundException('User not found after assigning roles');

    return updatedUser;
  }

  async assignDefaultRoleToOrg(dto: AssignDefaultRoleToOrgDto) {
    const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });

    if (!role || role.type !== RoleType.DEFAULT) {
      throw new ForbiddenException(
        'Only default roles can be assigned to organizations',
      );
    }

    const existing = await this.organizationRoleRepo.findOne({
      where: {
        roleId: dto.roleId,
        organizationId: dto.organizationId,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Role already assigned to this organization',
      );
    }

    const mapping = this.organizationRoleRepo.create({
      organizationId: dto.organizationId,
      roleId: dto.roleId,
      assignedBy: dto.assignedBy,
    });

    return this.organizationRoleRepo.save(mapping);
  }

  async findAllForOrg(orgId: string): Promise<Role[]> {
    await this.ensureDefaultRolesForOrganization(orgId);

    const defaultAssignments = await this.organizationRoleRepo.find({
      where: { organizationId: orgId },
      relations: [
        'role',
        'role.rolePermissions',
        'role.rolePermissions.permission',
      ],
    });

    const defaultRoles = defaultAssignments.map((r) => r.role);

    const customRoles = await this.roleRepo.find({
      where: { organizationId: orgId },
      relations: ['rolePermissions', 'rolePermissions.permission'],
    });

    return [...defaultRoles, ...customRoles].sort((a, b) => {
      const aTime = a.createdOn ? new Date(a.createdOn).getTime() : 0;
      const bTime = b.createdOn ? new Date(b.createdOn).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  private async ensureDefaultRolesForOrganization(orgId: string): Promise<void> {
    const defaultRoleNames = RolesService.DEFAULT_ORG_ROLES.map((role) => role.roleName);
    const existingRoles = await this.roleRepo.find({
      where: { organizationId: orgId, roleName: In(defaultRoleNames) },
      select: ['roleName'],
    });

    const existingNames = new Set(existingRoles.map((role) => role.roleName));
    const missingDefaults = RolesService.DEFAULT_ORG_ROLES.filter(
      (role) => !existingNames.has(role.roleName),
    );

    if (!missingDefaults.length) {
      return;
    }

    await this.roleRepo.save(
      missingDefaults.map((role) =>
        this.roleRepo.create({
          roleName: role.roleName,
          description: role.description,
          type: RoleType.DEFAULT,
          organizationId: orgId,
        }),
      ),
    );
  }

  async updateRole(id: string, dto: { roleName?: string; description?: string }): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (dto.roleName !== undefined) role.roleName = dto.roleName;
    if (dto.description !== undefined) role.description = dto.description;
    return this.roleRepo.save(role);
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.type === RoleType.DEFAULT) {
      throw new ForbiddenException('Default roles cannot be deleted');
    }
    await this.roleRepo.delete(id);
  }
}
