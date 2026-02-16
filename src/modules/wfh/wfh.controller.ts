import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { WfhService } from './wfh.service';
import { ApplyWfhDto } from './dto/apply-wfh.dto';
import { ApproveWfhDto } from './dto/approve-wfh.dto';
import { CreateWfhAssignmentDto } from './dto/create-wfh-assignment.dto';
import { InitializeWfhBalanceDto } from './dto/initialize-wfh-balance.dto';
import { SetWfhBalanceTemplatesDto } from './dto/set-wfh-balance-templates.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('WFH')
@Controller('wfh')
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
  async getRequestsByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.wfhService.getRequestsByUser(userId);
  }

  @Get('all/:orgId')
  @ApiOperation({ summary: 'Get all WFH requests for an organization' })
  @ApiParam({ name: 'orgId', type: 'string', format: 'uuid' })
  async getRequestsByOrg(
    @Param('orgId', ParseUUIDPipe) orgId: string,
  ) {
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
  async getAssignments(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.wfhService.getAssignments(userId);
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
}
