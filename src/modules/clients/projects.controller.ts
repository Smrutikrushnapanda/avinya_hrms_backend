import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { TaskStatus, TaskPriority } from './entities/project-task.entity';

@ApiTags('Projects')
@ApiBearerAuth()
@RequireProPlan()
@Controller('client-projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  private isAdminOrManager(user: JwtPayload) {
    return user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create project' })
  @UseGuards(JwtAuthGuard)
  create(@GetUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.projectsService.create({ ...dto, organizationId: user.organizationId });
  }

  @Get('my')
  @ApiOperation({ summary: 'Get client projects relevant to current user (managed + assigned)' })
  @UseGuards(JwtAuthGuard)
  findMyProjects(@GetUser() user: JwtPayload) {
    return this.projectsService.findManagedByUserId(user.userId, user.organizationId);
  }

  @Get()
  @ApiOperation({ summary: 'List projects by organization' })
  @ApiQuery({ name: 'organizationId', required: true, type: String })
  @ApiQuery({ name: 'clientId', required: false, type: String })
  @UseGuards(JwtAuthGuard)
  findAll(
    @GetUser() user: JwtPayload,
    @Query('organizationId') organizationId: string,
    @Query('clientId') clientId?: string,
  ) {
    const orgId = organizationId || user.organizationId;
    return this.projectsService.findAll(orgId, clientId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project' })
  @UseGuards(JwtAuthGuard)
  update(@GetUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.projectsService.update(id, dto);
  }

  @Put(':id/completion')
  @ApiOperation({ summary: 'Update project completion percent (for assigned manager)' })
  @UseGuards(JwtAuthGuard)
  updateCompletion(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { completionPercent: number },
  ) {
    return this.projectsService.updateCompletionByManager(id, user.userId, user.organizationId, body.completionPercent);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  @UseGuards(JwtAuthGuard)
  remove(@GetUser() user: JwtPayload, @Param('id') id: string) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.projectsService.remove(id);
  }

  // ─── Employee Assignment ───────────────────────────────────────────────────

  @Get(':id/employees')
  @ApiOperation({ summary: 'Get employees assigned to a client project' })
  @UseGuards(JwtAuthGuard)
  getProjectEmployees(@Param('id') id: string) {
    return this.projectsService.getProjectEmployees(id);
  }

  @Post(':id/employees')
  @ApiOperation({ summary: 'Assign employees to a client project' })
  @UseGuards(JwtAuthGuard)
  assignEmployees(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { userIds: string[] },
  ) {
    const isAdmin = user.roles?.some((r) => r.roleName === 'ADMIN') ?? false;
    return this.projectsService.assignEmployees(
      id,
      body.userIds,
      user.userId,
      user.organizationId,
      isAdmin,
    );
  }

  @Delete(':id/employees/:userId')
  @ApiOperation({ summary: 'Remove an employee from a client project' })
  @UseGuards(JwtAuthGuard)
  removeEmployee(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.projectsService.removeEmployee(id, userId);
  }

  // ─── Task Management ───────────────────────────────────────────────────

  @Post(':id/tasks')
  @ApiOperation({ summary: 'Create a task/work assignment for a project' })
  @UseGuards(JwtAuthGuard)
  createTask(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Body() body: {
      title: string;
      description?: string;
      assignedToUserId?: string;
      dueDate?: string;
      priority?: TaskPriority;
    },
  ) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.projectsService.createTask(projectId, {
      ...body,
      assignedByUserId: user.userId,
    });
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get all tasks for a project' })
  @UseGuards(JwtAuthGuard)
  getProjectTasks(@Param('id') projectId: string) {
    return this.projectsService.getProjectTasks(projectId);
  }

  @Get('tasks/my')
  @ApiOperation({ summary: 'Get tasks assigned to current user' })
  @UseGuards(JwtAuthGuard)
  getMyTasks(@GetUser() user: JwtPayload) {
    return this.projectsService.getMyAssignedTasks(user.userId, user.organizationId);
  }

  @Put(':id/tasks/:taskId/status')
  @ApiOperation({ summary: 'Update task status' })
  @UseGuards(JwtAuthGuard)
  updateTaskStatus(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: { status: TaskStatus },
  ) {
    return this.projectsService.updateTaskStatus(taskId, user.userId, body.status);
  }

  @Delete(':id/tasks/:taskId')
  @ApiOperation({ summary: 'Delete a task' })
  @UseGuards(JwtAuthGuard)
  deleteTask(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.projectsService.deleteTask(taskId, user.userId, user.organizationId);
  }
}
