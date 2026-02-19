import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from './entities/workflow.entity';
import { WorkflowStep } from './entities/workflow-step.entity';
import { WorkflowAssignment } from './entities/workflow-assignment.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { TimeslipController } from './timeslip/timeslip.controller';
import { TimeslipService } from './timeslip/timeslip.service';
import { Timeslip } from './timeslip/entities/timeslip.entity';
import { TimeslipApproval } from './timeslip/entities/timeslip-approval.entity';
import { MessageModule } from '../message/message.module';
import { Employee } from '../employee/entities/employee.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowStep,
      WorkflowAssignment,
      Timeslip,
      TimeslipApproval,
      Employee,
      Attendance,
    ]),
    MessageModule,
  ],
  controllers: [WorkflowController, TimeslipController],
  providers: [WorkflowService, TimeslipService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
