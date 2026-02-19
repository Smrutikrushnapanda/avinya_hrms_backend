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
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { LeaveService } from './leave.service';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';
import { CreateLeaveAssignmentDto } from './dto/create-leave-assignment.dto';
import { InitializeBalanceDto } from './dto/initialize-balance.dto';
import { SetLeaveBalanceTemplatesDto } from './dto/set-leave-balance-templates.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Leave')
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  // ─── Leave Types ───

  @Get('types/:orgId')
  @ApiOperation({ summary: 'Get leave types for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getLeaveTypes(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.leaveService.getLeaveTypes(orgId);
  }

  @Post('types')
  @ApiOperation({ summary: 'Create a leave type' })
  async createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(dto);
  }

  @Put('types/:id')
  @ApiOperation({ summary: 'Update a leave type' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async updateLeaveType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.leaveService.updateLeaveType(id, dto);
  }

  @Delete('types/:id')
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
  async getLeaveBalance(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.leaveService.getLeaveBalance(userId);
  }

  @Post('balance/initialize')
  @ApiOperation({ summary: 'Initialize or update leave balance' })
  @ApiBody({ type: InitializeBalanceDto })
  async initializeBalance(@Body() dto: InitializeBalanceDto) {
    return this.leaveService.initializeLeaveBalance(dto);
  }

  // ─── Leave Balance Templates ───

  @Post('balance-templates')
  @ApiOperation({ summary: 'Set leave balance templates by employment type' })
  @ApiBody({ type: SetLeaveBalanceTemplatesDto })
  async setLeaveBalanceTemplates(@Body() dto: SetLeaveBalanceTemplatesDto) {
    return this.leaveService.setLeaveBalanceTemplates(dto);
  }

  @Get('balance-templates/:orgId')
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
  ) {
    return this.leaveService.applyForLeave(
      userId,
      dto.leaveTypeId,
      dto.startDate,
      dto.endDate,
      dto.reason,
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
    @Param('approverId', ParseUUIDPipe) approverId: string,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.leaveService.approveOrRejectLeave(
      approverId,
      requestId,
      dto.approve,
      dto.remarks,
    );
  }

  @Get('pending/:approverId')
  @ApiOperation({ summary: 'Get pending approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getPendingApprovals(@Param('approverId', ParseUUIDPipe) approverId: string) {
    return this.leaveService.getPendingApprovalsForUser(approverId);
  }

  @Get('my-approvals/:approverId')
  @ApiOperation({ summary: 'Get all approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getAllApprovals(@Param('approverId', ParseUUIDPipe) approverId: string) {
    return this.leaveService.getAllApprovalsForUser(approverId);
  }

  // ─── Leave Requests Queries ───

  @Get('requests/:userId')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300) // 5 minutes
  @ApiOperation({ summary: 'Get all leave requests for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getLeaveRequestsByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.leaveService.getLeaveRequestsByUser(userId);
  }

  @Get('all/:orgId')
  @ApiOperation({ summary: 'Get all leave requests for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getLeaveRequestsByOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.leaveService.getLeaveRequestsByOrg(orgId);
  }

  // ─── Approval Assignments ───

  @Post('approval-assignments')
  @ApiOperation({ summary: 'Create a leave approval assignment' })
  @ApiBody({ type: CreateLeaveAssignmentDto })
  async createAssignment(@Body() dto: CreateLeaveAssignmentDto) {
    return this.leaveService.createApprovalAssignment(dto);
  }

  @Get('approval-assignments/:userId')
  @ApiOperation({ summary: 'Get leave approval assignments for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getAssignments(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.leaveService.getApprovalAssignments(userId);
  }

  @Get('approval-assignments/org/:orgId')
  @ApiOperation({ summary: 'Get leave approval assignments for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getAssignmentsByOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.leaveService.getApprovalAssignmentsByOrg(orgId);
  }

  @Delete('approval-assignments/:id')
  @ApiOperation({ summary: 'Delete a leave approval assignment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteAssignment(@Param('id', ParseUUIDPipe) id: string) {
    await this.leaveService.deleteApprovalAssignment(id);
    return { message: 'Assignment deleted successfully' };
  }
}
