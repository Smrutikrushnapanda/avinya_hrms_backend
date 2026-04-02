import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { AuthCoreModule } from '../auth-core/auth-core.module';
import { Employee } from '../employee/entities/employee.entity';
import { ProjectIssue } from './entities/project-issue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, ProjectIssue, Employee]),
    AuthCoreModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
