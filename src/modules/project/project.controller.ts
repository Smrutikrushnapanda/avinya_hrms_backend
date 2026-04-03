import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectIssueDto } from './dto/create-project-issue.dto';
import { UpdateProjectIssueDto } from './dto/update-project-issue.dto';
import { CreateProjectTestSheetTabDto } from './dto/create-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetTabDto } from './dto/update-project-test-sheet-tab.dto';
import { UpdateProjectTestSheetColumnsDto } from './dto/update-project-test-sheet-columns.dto';
import { CreateProjectTestCaseDto } from './dto/create-project-test-case.dto';
import { UpdateProjectTestCaseDto } from './dto/update-project-test-case.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
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
    return this.service.findMyProjects(user.userId, user.organizationId);
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

  @Get(':id/timesheets')
  getProjectTimesheets(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit = 200,
  ) {
    return this.service.getProjectTimesheets(
      id,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
      { fromDate, toDate, page, limit },
    );
  }

  @Get(':id')
  findOne(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.findOneForUser(
      id,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
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
    return this.service.getProjectEmployees(
      id,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Post(':id/employees')
  assignEmployees(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      userIds?: string[];
      assignments?: { userId: string; role?: string }[];
    },
  ) {
    const assignments =
      body?.assignments && Array.isArray(body.assignments)
        ? body.assignments
        : body?.userIds ?? [];
    return this.service.assignEmployees(
      id,
      assignments,
      user.userId,
      user.organizationId,
    );
  }

  @Delete(':id/employees/:userId')
  removeEmployee(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.removeEmployee(
      id,
      userId,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Patch(':id/members/:userId/role')
  updateMemberRole(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ) {
    if (!this.isAdminOrManager(user)) throw new ForbiddenException('Access denied');
    return this.service.updateMemberRole(id, userId, dto.role, user.organizationId);
  }

  @Get(':id/issues')
  listIssues(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.listIssues(
      id,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Post(':id/issues')
  createIssue(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateProjectIssueDto,
  ) {
    return this.service.createIssue(
      id,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Patch(':id/issues/:issueId')
  updateIssue(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('issueId') issueId: string,
    @Body() dto: UpdateProjectIssueDto,
  ) {
    return this.service.updateIssue(
      id,
      issueId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Get(':id/test-sheet')
  getTestSheet(@GetUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getTestSheet(
      id,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Post(':id/test-sheet/tabs')
  createTestSheetTab(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateProjectTestSheetTabDto,
  ) {
    return this.service.createTestSheetTab(
      id,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Patch(':id/test-sheet/columns')
  updateTestSheetColumns(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProjectTestSheetColumnsDto,
  ) {
    return this.service.updateTestSheetColumnHeaders(
      id,
      dto.columnHeaders,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Patch(':id/test-sheet/tabs/:tabId')
  updateTestSheetTab(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('tabId') tabId: string,
    @Body() dto: UpdateProjectTestSheetTabDto,
  ) {
    return this.service.updateTestSheetTab(
      id,
      tabId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Post(':id/test-sheet/tabs/:tabId/cases')
  createTestCase(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('tabId') tabId: string,
    @Body() dto: CreateProjectTestCaseDto,
  ) {
    return this.service.createTestCase(
      id,
      tabId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

  @Patch(':id/test-sheet/cases/:caseId')
  updateTestCase(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateProjectTestCaseDto,
  ) {
    return this.service.updateTestCase(
      id,
      caseId,
      dto,
      user.userId,
      user.organizationId,
      this.isAdminOrManager(user),
    );
  }

}
