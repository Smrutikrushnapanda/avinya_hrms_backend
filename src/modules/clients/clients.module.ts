import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientProject } from './entities/project.entity';
import { ClientProjectMember } from './entities/client-project-member.entity';
import { Employee } from '../employee/entities/employee.entity';
import { ClientsController } from './clients.controller';
import { ProjectsController } from './projects.controller';
import { ClientsService } from './clients.service';
import { ProjectsService } from './projects.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientProject, ClientProjectMember, Employee])],
  controllers: [ClientsController, ProjectsController],
  providers: [ClientsService, ProjectsService],
})
export class ClientsModule {}
