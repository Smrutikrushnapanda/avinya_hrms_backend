import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Leave')
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types/:orgId')
  @ApiOperation({ summary: 'Get leave types for an organization' })
  @ApiParam({ name: 'orgId', description: 'Organization ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of leave types' })
  async getLeaveTypes(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.leaveService.getLeaveTypes(orgId);
  }

  @Get('balance/:userId')
  @ApiOperation({ summary: 'Get leave balance for a user' })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave balance details' })
  async getLeaveBalance(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.leaveService.getLeaveBalance(userId);
  }

  @Post('apply/:userId')
  @ApiOperation({ summary: 'Apply for leave' })
  @ApiParam({ name: 'userId', description: 'User ID', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApplyLeaveDto })
  @ApiResponse({ status: 201, description: 'Leave request submitted' })
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

  @Post('approve/:requestId/:approverId')
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  @ApiParam({ name: 'requestId', description: 'Leave Request ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'approverId', description: 'Approver ID', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApproveLeaveDto })
  @ApiResponse({ status: 200, description: 'Approval/rejection status updated' })
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
  @ApiParam({ name: 'approverId', description: 'Approver ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of pending leave approvals' })
  async getPendingApprovals(@Param('approverId', ParseUUIDPipe) approverId: string) {
    return this.leaveService.getPendingApprovalsForUser(approverId);
  }
}