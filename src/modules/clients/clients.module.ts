import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { Project } from './entities/project.entity';
import { ClientsController } from './clients.controller';
import { ProjectsController } from './projects.controller';
import { ClientsService } from './clients.service';
import { ProjectsService } from './projects.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Project])],
  controllers: [ClientsController, ProjectsController],
  providers: [ClientsService, ProjectsService],
})
export class ClientsModule {}
