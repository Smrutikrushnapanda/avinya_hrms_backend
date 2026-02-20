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
import { Timesheet } from './timesheet/entities/timesheet.entity';
import { TimesheetController } from './timesheet/timesheet.controller';
import { TimesheetService } from './timesheet/timesheet.service';
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
      Timesheet,
    ]),
    MessageModule,
  ],
  controllers: [WorkflowController, TimeslipController, TimesheetController],
  providers: [WorkflowService, TimeslipService, TimesheetService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
