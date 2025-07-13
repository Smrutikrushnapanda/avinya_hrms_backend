import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

import {
  Holiday,
  LeaveApproval,
  LeaveApprovalAssignment,
  LeaveBalance,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  LeaveWorkflowConfig,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeaveType,
      LeavePolicy,
      LeaveBalance,
      LeaveRequest,
      LeaveApproval,
      LeaveApprovalAssignment,
      LeaveWorkflowConfig,
      Holiday,
    ]),
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
