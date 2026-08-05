import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectTask } from '../clients/entities/project-task.entity';
import { ClientProject } from '../clients/entities/project.entity';
import { ProjectIssue } from '../project/entities/project-issue.entity';
import { Project } from '../project/entities/project.entity';
import { Employee } from '../employee/entities/employee.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { AssignWorkController } from './assign-work.controller';
import { AssignWorkService } from './assign-work.service';
import { MessageModule } from '../message/message.module';
import { LogReportModule } from '../log-report/log-report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectTask,
      ClientProject,
      ProjectIssue,
      Project,
      Employee,
      UserPushToken,
    ]),
    MessageModule,
    LogReportModule,
  ],
  controllers: [AssignWorkController],
  providers: [AssignWorkService],
})
export class AssignWorkModule {}
