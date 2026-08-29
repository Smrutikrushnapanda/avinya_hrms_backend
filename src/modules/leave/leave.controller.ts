import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { LeaveService } from './leave.service';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { CreateLeaveAssignmentDto } from './dto/create-leave-assignment.dto';
import { InitializeBalanceDto } from './dto/initialize-balance.dto';
import { SetLeaveBalanceTemplatesDto } from './dto/set-leave-balance-templates.dto';
import {
  SetEmployeeLeaveLimitDto,
  UpdateEmployeeLeaveLimitDto,
} from './dto/set-employee-leave-limit.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';

type AuthActor = {
  userId?: string;
  id?: string;
  organizationId?: string;
  roles?: { roleName: string }[];
};

@Controller('leave')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  private actorId(actor: AuthActor): string {
    return actor?.userId || actor?.id || '';
  }

  private hasRole(actor: AuthActor, roles: string[]): boolean {
    return !!actor?.roles?.some((r) => roles.includes(r.roleName));
  }

  private canManageOthers(actor: AuthActor): boolean {
    return this.hasRole(actor, ['ADMIN', 'HR', 'SUPERADMIN', 'MANAGER']);
  }

  private assertSameOrg(actor: AuthActor, orgId: string) {
    if (
      !this.hasRole(actor, ['SUPERADMIN']) &&
      actor?.organizationId &&
      actor.organizationId !== orgId
    ) {
      throw new ForbiddenException(
        'You can only access leave data for your own organization.',
      );
    }
  }

  // Resolves the effective user for user-scoped actions: non-privileged
  // callers are locked to their own account.
  private resolveTargetUser(actor: AuthActor, targetUserId: string): string {
    if (this.canManageOthers(actor)) return targetUserId;
    if (this.actorId(actor) !== targetUserId) {
      throw new ForbiddenException('You can only access your own leave data.');
    }
    return targetUserId;
  }

  // ─── Leave Types ───

  @Get('types/:orgId')
  @ApiOperation({ summary: 'Get leave types for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getLeaveTypes(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @GetUser() actor: AuthActor,
    @Query('gender') gender?: string,
  ) {
    this.assertSameOrg(actor, orgId);
    return this.leaveService.getLeaveTypes(orgId, gender);
  }

  @Post('types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Create a leave type' })
  async createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(dto);
  }

  @Put('types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Update a leave type' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateLeaveType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateLeaveType(id, dto);
  }

  @Delete('types/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Delete a leave type' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteLeaveType(@Param('id', ParseUUIDPipe) id: string) {
    await this.leaveService.deleteLeaveType(id);
    return { message: 'Leave type deleted successfully' };
  }

  // ─── Leave Balance ───

  @Get('balance/:userId')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get leave balance for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getLeaveBalance(
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.getLeaveBalance(
      this.resolveTargetUser(actor, userId),
    );
  }

  @Post('balance/initialize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Initialize or update leave balance' })
  @ApiBody({ type: InitializeBalanceDto })
  async initializeBalance(@Body() dto: InitializeBalanceDto) {
    return this.leaveService.initializeLeaveBalance(dto);
  }

  @Post('credit-earned/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({
    summary: 'Credit earned leave when employee works on weekend/holiday',
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async creditEarnedLeave(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: { days: number; organizationId: string },
  ) {
    return this.leaveService.creditEarnedLeave(
      userId,
      body.days,
      body.organizationId,
    );
  }

  // ─── Leave Balance Templates ───

  @Post('balance-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Set leave balance templates by employment type' })
  @ApiBody({ type: SetLeaveBalanceTemplatesDto })
  async setLeaveBalanceTemplates(@Body() dto: SetLeaveBalanceTemplatesDto) {
    return this.leaveService.setLeaveBalanceTemplates(dto);
  }

  @Get('balance-templates/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Get leave balance templates for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getLeaveBalanceTemplates(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.leaveService.getLeaveBalanceTemplates(orgId, employmentType);
  }

  // ─── Leave Application ───

  @Post('apply/:userId')
  @ApiOperation({ summary: 'Apply for leave' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApplyLeaveDto })
  async applyForLeave(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ApplyLeaveDto,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.applyForLeave(
      this.resolveTargetUser(actor, userId),
      dto.leaveTypeId,
      dto.startDate,
      dto.endDate,
      dto.reason,
      dto.duration,
    );
  }

  // ─── Leave Approval ───

  @Post('approve/:requestId/:approverId')
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  @ApiParam({ name: 'requestId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApproveLeaveDto })
  async approveOrReject(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('approverId', ParseUUIDPipe) _approverId: string,
    @Body() dto: ApproveLeaveDto,
    @GetUser() actor: AuthActor,
  ) {
    // The caller acts as the approver: the identity of the approver is taken
    // from the JWT, ignoring any client-supplied approver id.
    return this.leaveService.approveOrRejectLeave(
      this.actorId(actor),
      requestId,
      dto.approve,
      dto.remarks,
    );
  }

  @Get('pending/:approverId')
  @ApiOperation({ summary: 'Get pending approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getPendingApprovals(
    @Param('approverId', ParseUUIDPipe) _approverId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.getPendingApprovalsForUser(this.actorId(actor));
  }

  @Get('my-approvals/:approverId')
  @ApiOperation({ summary: 'Get all approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getAllApprovals(
    @Param('approverId', ParseUUIDPipe) _approverId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.getAllApprovalsForUser(this.actorId(actor));
  }

  // ─── Leave Requests Queries ───

  @Get('requests/:userId')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get all leave requests for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getLeaveRequestsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.getLeaveRequestsByUser(
      this.resolveTargetUser(actor, userId),
    );
  }

  @Delete('requests/:requestId/:userId')
  @ApiOperation({
    summary: 'Delete a pending leave request before leave start date',
  })
  @ApiParam({ name: 'requestId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteLeaveRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: AuthActor,
  ) {
    await this.leaveService.deleteLeaveRequestByUser(
      requestId,
      this.resolveTargetUser(actor, userId),
    );
    return { message: 'Leave request deleted successfully' };
  }

  @Get('all/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'MANAGER')
  @ApiOperation({ summary: 'Get all leave requests for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getLeaveRequestsByOrg(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @GetUser() actor: AuthActor,
  ) {
    this.assertSameOrg(actor, orgId);
    return this.leaveService.getLeaveRequestsByOrg(orgId);
  }

  // ─── Approval Assignments ───

  @Post('approval-assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Create a leave approval assignment' })
  @ApiBody({ type: CreateLeaveAssignmentDto })
  async createAssignment(@Body() dto: CreateLeaveAssignmentDto) {
    return this.leaveService.createApprovalAssignment(dto);
  }

  @Get('approval-assignments/:userId')
  @ApiOperation({ summary: 'Get leave approval assignments for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getAssignments(
    @Param('userId', ParseUUIDPipe) userId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.getApprovalAssignments(
      this.resolveTargetUser(actor, userId),
    );
  }

  @Get('approval-assignments/org/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({
    summary: 'Get leave approval assignments for an organization',
  })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getAssignmentsByOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.leaveService.getApprovalAssignmentsByOrg(orgId);
  }

  @Delete('approval-assignments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Delete a leave approval assignment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteAssignment(@Param('id', ParseUUIDPipe) id: string) {
    await this.leaveService.deleteApprovalAssignment(id);
    return { message: 'Assignment deleted successfully' };
  }

  // ─── Employee Leave Limits ───

  @Post('employee-limits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Set or update leave limits for an employee' })
  @ApiBody({ type: SetEmployeeLeaveLimitDto })
  async setEmployeeLeaveLimit(@Body() dto: SetEmployeeLeaveLimitDto) {
    return this.leaveService.setEmployeeLeaveLimit(dto);
  }

  @Get('employee-limits/:userId/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Get leave limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getEmployeeLeaveLimits(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.leaveService.getEmployeeLeaveLimits(userId, orgId);
  }

  @Put('employee-limits/:userId/:leaveTypeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Update leave limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'leaveTypeId', type: 'string', format: 'uuid' })
  async updateEmployeeLeaveLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('leaveTypeId', ParseUUIDPipe) leaveTypeId: string,
    @Body() dto: UpdateEmployeeLeaveLimitDto,
  ) {
    return this.leaveService.updateEmployeeLeaveLimit(userId, leaveTypeId, dto);
  }

  @Delete('employee-limits/:userId/:leaveTypeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Remove leave limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'leaveTypeId', type: 'string', format: 'uuid' })
  async deleteEmployeeLeaveLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('leaveTypeId', ParseUUIDPipe) leaveTypeId: string,
  ) {
    await this.leaveService.deleteEmployeeLeaveLimit(userId, leaveTypeId);
    return { message: 'Leave limit removed successfully' };
  }

  // ─── Reconciliation ───

  @Post('reconcile/:requestId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({
    summary:
      'Reconcile a specific leave request — restores balance for dates where employee attended work',
  })
  @ApiParam({ name: 'requestId', type: 'string', format: 'uuid' })
  async reconcileLeaveRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @GetUser() actor: AuthActor,
  ) {
    return this.leaveService.reconcileSingleRequest(requestId, actor.id);
  }

  @Post('reconcile-all/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Batch reconcile all unreconciled approved leaves for an organization',
  })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async reconcileAllLeaves(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @GetUser() actor: AuthActor,
  ) {
    this.assertSameOrg(actor, orgId);
    return this.leaveService.reconcileAllPending(orgId);
  }
}
