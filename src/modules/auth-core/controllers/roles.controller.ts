import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import {
  CreateRoleDto,
  AssignRoleDto,
  AssignDefaultRoleToOrgDto,
  UpdateRoleDto,
  AssignPermissionsToRoleDto,
} from '../dto/roles.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { GetUser } from '../decorators/get-user.decorator';
import { User } from '../entities/user.entity';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  private assertSameOrg(actor: User, organizationId: string) {
    if (
      !(actor as any)?.roles?.some(
        (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
      ) &&
      actor?.organizationId &&
      actor.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'You can only manage roles in your own organization.',
      );
    }
  }

  @Post()
  @Roles('ADMIN')
  createRole(@Body() createRoleDto: CreateRoleDto, @GetUser() actor: User) {
    if (createRoleDto.organizationId) {
      this.assertSameOrg(actor, createRoleDto.organizationId);
    }
    return this.rolesService.createRole(createRoleDto);
  }

  @Get()
  getAllRoles() {
    return this.rolesService.findAll();
  }

  @Get('/:id')
  getRoleById(@Param('id') id: string) {
    return this.rolesService.findById(id);
  }

  @Post('/assign')
  @Roles('ADMIN')
  assignRole(@Body() assignRoleDto: AssignRoleDto, @GetUser() actor: User) {
    return this.rolesService.assignRoleToUser(assignRoleDto);
  }

  @Post('/assign-default')
  @Roles('ADMIN')
  assignDefaultRoleToOrg(
    @Body() dto: AssignDefaultRoleToOrgDto,
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, dto.organizationId);
    return this.rolesService.assignDefaultRoleToOrg(dto);
  }

  @Get('/organization/:orgId')
  getAllRolesForOrganization(
    @Param('orgId') orgId: string,
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, orgId);
    return this.rolesService.findAllForOrg(orgId);
  }

  @Put('/:id')
  @Roles('ADMIN')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @GetUser() actor: User,
  ) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete('/:id')
  @Roles('ADMIN')
  async deleteRole(@Param('id') id: string) {
    await this.rolesService.deleteRole(id);
    return { message: 'Role deleted successfully' };
  }

  @Post('/:id/permissions')
  @Roles('ADMIN')
  assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsToRoleDto,
  ) {
    return this.rolesService.assignPermissionsToRole(id, dto);
  }

  @Delete('/:id/permissions/:permissionId')
  @Roles('ADMIN')
  async revokePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ) {
    await this.rolesService.revokePermissionFromRole(id, permissionId);
    return { message: 'Permission revoked from role' };
  }
}
