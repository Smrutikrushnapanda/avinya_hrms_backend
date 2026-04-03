import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { Employee } from '../employee/entities/employee.entity';
import { ProjectIssue } from './entities/project-issue.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, ProjectIssue, Employee, Timesheet]),
    AuthCoreModule,
    MessageModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
