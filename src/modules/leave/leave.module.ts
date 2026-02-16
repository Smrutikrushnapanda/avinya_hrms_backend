import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { MessageModule } from '../message/message.module';
import { AuthCoreModule } from '../auth-core/auth-core.module';

import {
  Holiday,
  LeaveApproval,
  LeaveApprovalAssignment,
  LeaveBalance,
  LeaveBalanceTemplate,
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
      LeaveBalanceTemplate,
      LeaveRequest,
      LeaveApproval,
      LeaveApprovalAssignment,
      LeaveWorkflowConfig,
      Holiday,
    ]),
    MessageModule,
    AuthCoreModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
