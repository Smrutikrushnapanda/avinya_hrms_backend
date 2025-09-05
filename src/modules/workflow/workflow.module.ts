import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from './entities/workflow.entity';
import { WorkflowStep } from './entities/workflow-step.entity';
import { WorkflowAssignment } from './entities/workflow-assignment.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { TimeslipController } from './timeslip/timeslip.controller';
import { TimeslipService } from './timeslip/timeslip.service';
import { Timeslip } from './timeslip/entities/timeslip.entity'
import { TimeslipApproval } from './timeslip/entities/timeslip-approval.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workflow,
      WorkflowStep,
      WorkflowAssignment,
      Timeslip,
      TimeslipApproval
    ]),
  ],
  controllers: [WorkflowController, TimeslipController],
  providers: [WorkflowService, TimeslipService],
  exports: [WorkflowService],
})
export class WorkflowModule {}