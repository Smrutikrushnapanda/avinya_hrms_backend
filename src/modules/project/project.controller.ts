import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@RequireProPlan()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  private isAdminOrManager(user: JwtPayload) {
    return user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
  }

  @Post()
  create(@GetUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.create(user.organizationId, user.userId, dto);
  }

  @Get()
  findAll(@GetUser() user: JwtPayload) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.findAll(user.organizationId);
  }

  @Get('my')
  findMyProjects(@GetUser() user: JwtPayload) {
    return this.service.findMyProjects(user.userId);
  }

  @Get('managers/team')
  getMyTeamEmployees(@GetUser() user: JwtPayload) {
    return this.service.getMyTeamEmployees(user.userId, user.organizationId);
  }

  @Get('org-employees')
  getAllOrgEmployees(
    @GetUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('designationId') designationId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.service.getAllOrgEmployees(user.organizationId, user.userId, {
      search,
      designationId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get(':id')
  findOne(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@GetUser() user: JwtPayload, @Param('id') id: string) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.remove(id);
  }

  @Post(':id/members')
  assignMembers(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { userIds: string[] },
  ) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.assignMembers(id, body.userIds);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.removeMember(id, userId);
  }

  // ─── Employee Assignment (for managers to assign employees to their projects) ───

  @Get(':id/employees')
  getProjectEmployees(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getProjectEmployees(id);
  }

  @Post(':id/employees')
  assignEmployees(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { userIds: string[] },
  ) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN') ?? false;
    return this.service.assignEmployees(
      id,
      body.userIds,
      user.userId,
      user.organizationId,
      isAdmin,
    );
  }

  @Delete(':id/employees/:userId')
  removeEmployee(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.removeEmployee(id, userId);
  }

}
