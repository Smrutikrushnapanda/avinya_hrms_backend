import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, ForbiddenException, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectTestSheetTabDto } from '../project/dto/create-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetTabDto } from '../project/dto/update-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetColumnsDto } from '../project/dto/update-project-test-sheet-columns.dto';
import { CreateProjectTestCaseDto } from '../project/dto/create-project-test-case.dto';
import { UpdateProjectTestCaseDto } from '../project/dto/update-project-test-case.dto';
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

  private hasAnyRole(user: JwtPayload, roles: string[]) {
    const allowed = new Set(roles.map((role) => role.toUpperCase()));
    return (
      user.roles?.some((roleEntry) =>
        allowed.has(String(roleEntry?.roleName ?? '').toUpperCase()),
      ) ?? false
    );
  }

  private isAdmin(user: JwtPayload) {
    return this.hasAnyRole(user, ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN']);
  }

  private isAdminOrManager(user: JwtPayload) {
    return this.hasAnyRole(user, ['ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN', 'MANAGER']);
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a client project by id' })
  @UseGuards(JwtAuthGuard)
  findOne(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.projectsService.findOneForUser(
      id,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
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
    @Body()
    body: {
      userIds?: string[];
      assignments?: { userId: string; role?: string }[];
    },
  ) {
    const isAdmin = this.isAdmin(user);
    const assignments =
      body?.assignments && Array.isArray(body.assignments)
        ? body.assignments
        : body?.userIds ?? [];
    return this.projectsService.assignEmployees(
      id,
      assignments,
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
    return this.projectsService.createTask(projectId, {
      ...body,
      assignedByUserId: user.userId,
      organizationId: user.organizationId,
    });
  }

  @Get(':id/tasks')
  @ApiOperation({ summary: 'Get all tasks for a project' })
  @UseGuards(JwtAuthGuard)
  getProjectTasks(@Param('id') projectId: string) {
    return this.projectsService.getProjectTasks(projectId);
  }

  @Get(':id/test-sheet')
  @ApiOperation({ summary: 'Get test sheet data for a client project' })
  @UseGuards(JwtAuthGuard)
  getTestSheet(@GetUser() user: JwtPayload, @Param('id') projectId: string) {
    return this.projectsService.getTestSheet(
      projectId,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Post(':id/test-sheet/tabs')
  @ApiOperation({ summary: 'Create test sheet tab for a client project' })
  @UseGuards(JwtAuthGuard)
  createTestSheetTab(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Body() dto: CreateProjectTestSheetTabDto,
  ) {
    return this.projectsService.createTestSheetTab(
      projectId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Patch(':id/test-sheet/columns')
  @ApiOperation({ summary: 'Update test sheet column headers for a client project' })
  @UseGuards(JwtAuthGuard)
  updateTestSheetColumns(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Body() dto: UpdateProjectTestSheetColumnsDto,
  ) {
    return this.projectsService.updateTestSheetColumnHeaders(
      projectId,
      dto.columnHeaders,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Patch(':id/test-sheet/tabs/:tabId')
  @ApiOperation({ summary: 'Update test sheet tab for a client project' })
  @UseGuards(JwtAuthGuard)
  updateTestSheetTab(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('tabId') tabId: string,
    @Body() dto: UpdateProjectTestSheetTabDto,
  ) {
    return this.projectsService.updateTestSheetTab(
      projectId,
      tabId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Post(':id/test-sheet/tabs/:tabId/cases')
  @ApiOperation({ summary: 'Create test case row for a client project test sheet' })
  @UseGuards(JwtAuthGuard)
  createTestCase(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('tabId') tabId: string,
    @Body() dto: CreateProjectTestCaseDto,
  ) {
    return this.projectsService.createTestCase(
      projectId,
      tabId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Patch(':id/test-sheet/cases/:caseId')
  @ApiOperation({ summary: 'Update test case row for a client project test sheet' })
  @UseGuards(JwtAuthGuard)
  updateTestCase(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateProjectTestCaseDto,
  ) {
    return this.projectsService.updateTestCase(
      projectId,
      caseId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
  }

  @Delete(':id/test-sheet/cases/:caseId')
  @ApiOperation({ summary: 'Delete test case row for a client project test sheet' })
  @UseGuards(JwtAuthGuard)
  deleteTestCase(
    @GetUser() user: JwtPayload,
    @Param('id') projectId: string,
    @Param('caseId') caseId: string,
  ) {
    return this.projectsService.deleteTestCase(
      projectId,
      caseId,
      user.userId,
      user.organizationId,
      this.isAdmin(user),
    );
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

  // ─── Timesheets Summary ───────────────────────────────────────────────────

  @Get(':id/timesheets-summary')
  @ApiOperation({ summary: 'Get timesheet summary for P&L calculation' })
  @UseGuards(JwtAuthGuard)
  getTimesheetsSummary(@Param('id') projectId: string) {
    return this.projectsService.getTimesheetsSummary(projectId);
  }
}
