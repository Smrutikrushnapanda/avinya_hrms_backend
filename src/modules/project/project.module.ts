import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { Employee } from '../employee/entities/employee.entity';
import { ProjectIssue } from './entities/project-issue.entity';
import { ProjectTestSheetTab } from './entities/project-test-sheet-tab.entity';
import { ProjectTestSheetCase } from './entities/project-test-sheet-case.entity';
import { ProjectTestSheetChangeLog } from './entities/project-test-sheet-log.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { MessageModule } from '../message/message.module';
import { LogReportModule } from '../log-report/log-report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectIssue,
      ProjectTestSheetTab,
      ProjectTestSheetCase,
      ProjectTestSheetChangeLog,
      Employee,
      Timesheet,
    ]),
    AuthCoreModule,
    MessageModule,
    LogReportModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
