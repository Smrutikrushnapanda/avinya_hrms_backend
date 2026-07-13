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
  UseGuards,
} from '@nestjs/common';
import { WfhService } from './wfh.service';
import { ApplyWfhDto } from './dto/apply-wfh.dto';
import { ApproveWfhDto } from './dto/approve-wfh.dto';
import { CreateWfhAssignmentDto } from './dto/create-wfh-assignment.dto';
import { InitializeWfhBalanceDto } from './dto/initialize-wfh-balance.dto';
import { SetWfhBalanceTemplatesDto } from './dto/set-wfh-balance-templates.dto';
import {
  SetEmployeeWfhLimitDto,
  UpdateEmployeeWfhLimitDto,
} from './dto/set-employee-wfh-limit.dto';
import {
  SetEmployeeWorkArrangementDto,
  UpdateEmployeeWorkArrangementDto,
} from './dto/set-employee-work-arrangement.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';

@ApiTags('WFH')
@Controller('wfh')
@UseGuards(JwtAuthGuard)
export class WfhController {
  constructor(private readonly wfhService: WfhService) {}

  @Post('apply/:userId')
  @ApiOperation({ summary: 'Apply for work from home' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApplyWfhDto })
  @ApiResponse({ status: 201, description: 'WFH request submitted' })
  async applyForWfh(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ApplyWfhDto,
  ) {
    return this.wfhService.applyForWfh(userId, dto);
  }

  @Post('approve/:requestId/:approverId')
  @ApiOperation({ summary: 'Approve or reject a WFH request' })
  @ApiParam({ name: 'requestId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApproveWfhDto })
  @ApiResponse({ status: 200, description: 'WFH approval status updated' })
  async approveOrReject(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('approverId', ParseUUIDPipe) approverId: string,
    @Body() dto: ApproveWfhDto,
  ) {
    return this.wfhService.approveOrRejectWfh(
      approverId,
      requestId,
      dto.approve,
      dto.remarks,
    );
  }

  @Get('pending/:approverId')
  @ApiOperation({ summary: 'Get pending WFH approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getPendingApprovals(
    @Param('approverId', ParseUUIDPipe) approverId: string,
  ) {
    return this.wfhService.getPendingApprovalsForUser(approverId);
  }

  @Get('requests/:userId')
  @ApiOperation({ summary: 'Get all WFH requests for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getRequestsByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.wfhService.getRequestsByUser(userId);
  }

  @Delete('requests/:requestId/:userId')
  @ApiOperation({ summary: 'Delete a pending WFH request before start date' })
  @ApiParam({ name: 'requestId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteRequestByUser(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.wfhService.deleteRequestByUser(requestId, userId);
    return { message: 'WFH request deleted successfully' };
  }

  @Get('all/:orgId')
  @ApiOperation({ summary: 'Get all WFH requests for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getRequestsByOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.wfhService.getRequestsByOrg(orgId);
  }

  @Get('my-approvals/:approverId')
  @ApiOperation({ summary: 'Get all WFH approvals for an approver' })
  @ApiParam({ name: 'approverId', type: 'string', format: 'uuid' })
  async getAllApprovals(
    @Param('approverId', ParseUUIDPipe) approverId: string,
  ) {
    return this.wfhService.getAllApprovalsForUser(approverId);
  }

  @Post('approval-assignments')
  @ApiOperation({ summary: 'Create a WFH approval assignment' })
  @ApiBody({ type: CreateWfhAssignmentDto })
  @ApiResponse({ status: 201, description: 'Assignment created' })
  async createAssignment(@Body() dto: CreateWfhAssignmentDto) {
    return this.wfhService.createAssignment(dto);
  }

  @Get('approval-assignments/:userId')
  @ApiOperation({ summary: 'Get WFH approval assignments for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getAssignments(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.wfhService.getAssignments(userId);
  }

  @Get('approval-assignments/org/:organizationId')
  @ApiOperation({
    summary: 'Get all WFH approval assignments for an organization',
  })
  @ApiParam({ name: 'organizationId', type: 'string', format: 'uuid' })
  async getAssignmentsByOrg(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.wfhService.getAssignmentsByOrg(organizationId);
  }

  @Delete('approval-assignments/:id')
  @ApiOperation({ summary: 'Delete a WFH approval assignment' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async deleteAssignment(@Param('id', ParseUUIDPipe) id: string) {
    await this.wfhService.deleteAssignment(id);
    return { message: 'Assignment deleted successfully' };
  }

  @Get('balance/:userId')
  @ApiOperation({ summary: 'Get WFH balance for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getWfhBalance(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.wfhService.getWfhBalance(userId);
  }

  @Post('balance/initialize')
  @ApiOperation({ summary: 'Initialize or update WFH balance' })
  @ApiBody({ type: InitializeWfhBalanceDto })
  async initializeWfhBalance(@Body() dto: InitializeWfhBalanceDto) {
    return this.wfhService.initializeWfhBalance(dto);
  }

  @Post('balance-templates')
  @ApiOperation({ summary: 'Set WFH balance templates by employment type' })
  @ApiBody({ type: SetWfhBalanceTemplatesDto })
  async setWfhBalanceTemplates(@Body() dto: SetWfhBalanceTemplatesDto) {
    return this.wfhService.setWfhBalanceTemplates(dto);
  }

  @Get('balance-templates/:orgId')
  @ApiOperation({ summary: 'Get WFH balance templates for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getWfhBalanceTemplates(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('employmentType') employmentType?: string,
  ) {
    return this.wfhService.getWfhBalanceTemplates(orgId, employmentType);
  }

  // ─── Employee WFH Limits ───

  @Post('employee-limits')
  @ApiOperation({ summary: 'Set or update WFH limits for an employee' })
  @ApiBody({ type: SetEmployeeWfhLimitDto })
  async setEmployeeWfhLimit(@Body() dto: SetEmployeeWfhLimitDto) {
    return this.wfhService.setEmployeeWfhLimit(dto);
  }

  @Get('employee-limits/:userId/:orgId')
  @ApiOperation({ summary: 'Get WFH limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getEmployeeWfhLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
    return this.wfhService.getEmployeeWfhLimit(userId, orgId);
  }

  @Put('employee-limits/:userId')
  @ApiOperation({ summary: 'Update WFH limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async updateEmployeeWfhLimit(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateEmployeeWfhLimitDto,
  ) {
    return this.wfhService.updateEmployeeWfhLimit(userId, dto);
  }

  @Delete('employee-limits/:userId')
  @ApiOperation({ summary: 'Remove WFH limits for an employee' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteEmployeeWfhLimit(@Param('userId', ParseUUIDPipe) userId: string) {
    await this.wfhService.deleteEmployeeWfhLimit(userId);
    return { message: 'WFH limit removed successfully' };
  }

  // ─── Employee Work Arrangement (Office / Hybrid / Permanent Remote) ───

  @Get('work-arrangement/me')
  @ApiOperation({ summary: "Get the current user's own work arrangement" })
  async getMyWorkArrangement(@GetUser() user: User) {
    return this.wfhService.getEmployeeWorkArrangement(user.id);
  }

  @Get('work-arrangement/me/status')
  @ApiOperation({
    summary:
      "Get the current user's work arrangement plus computed Hybrid monthly quota",
  })
  async getMyWorkArrangementStatus(@GetUser() user: User) {
    return this.wfhService.getMyWorkArrangementStatus(user.id);
  }

  @Get('work-arrangement/org/:organizationId')
  @ApiOperation({
    summary: 'Get all employee work arrangements for an organization',
  })
  @ApiParam({ name: 'organizationId', type: 'string', format: 'uuid' })
  async getWorkArrangementsByOrg(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.wfhService.getWorkArrangementsByOrg(organizationId);
  }

  @Get('work-arrangement/:userId')
  @ApiOperation({ summary: "Get an employee's work arrangement" })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async getEmployeeWorkArrangement(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.wfhService.getEmployeeWorkArrangement(userId);
  }

  @Post('work-arrangement')
  @ApiOperation({
    summary:
      'Set or update an employee work arrangement (Office/Hybrid/Permanent Remote)',
  })
  @ApiBody({ type: SetEmployeeWorkArrangementDto })
  async setEmployeeWorkArrangement(
    @Body() dto: SetEmployeeWorkArrangementDto,
    @GetUser() user: User,
  ) {
    return this.wfhService.setEmployeeWorkArrangement(dto, user.id);
  }

  @Put('work-arrangement/:userId')
  @ApiOperation({ summary: "Update an employee's work arrangement" })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async updateEmployeeWorkArrangement(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateEmployeeWorkArrangementDto,
  ) {
    return this.wfhService.updateEmployeeWorkArrangement(userId, dto);
  }

  @Delete('work-arrangement/:userId')
  @ApiOperation({
    summary: "Remove an employee's work arrangement (reverts to Office)",
  })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid' })
  async deleteEmployeeWorkArrangement(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.wfhService.deleteEmployeeWorkArrangement(userId);
    return { message: 'Work arrangement removed successfully' };
  }
}
