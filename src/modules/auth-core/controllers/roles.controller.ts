import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { RolesService } from '../services/roles.service';
import {
  CreateRoleDto,
  AssignRoleDto,
  AssignDefaultRoleToOrgDto,
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
}