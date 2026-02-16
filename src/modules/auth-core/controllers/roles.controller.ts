import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import {
  CreateRoleDto,
  AssignRoleDto,
  AssignDefaultRoleToOrgDto,
  UpdateRoleDto,
} from '../dto/roles.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  createRole(@Body() createRoleDto: CreateRoleDto) {
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
  assignRole(@Body() assignRoleDto: AssignRoleDto) {
    return this.rolesService.assignRoleToUser(assignRoleDto);
  }

  @Post('/assign-default')
  assignDefaultRoleToOrg(@Body() dto: AssignDefaultRoleToOrgDto) {
    return this.rolesService.assignDefaultRoleToOrg(dto);
  }

  @Get('/organization/:orgId')
  getAllRolesForOrganization(@Param('orgId') orgId: string) {
    return this.rolesService.findAllForOrg(orgId);
  }

  @Put('/:id')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete('/:id')
  async deleteRole(@Param('id') id: string) {
    await this.rolesService.deleteRole(id);
    return { message: 'Role deleted successfully' };
  }
}
