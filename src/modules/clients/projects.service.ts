import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
  ) {}

  private async generateProjectCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = `PRJ-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;
      const exists = await this.projectRepo.findOne({ where: { projectCode: code } });
      if (!exists) return code;
    }
    return `PRJ-${Date.now().toString(36).toUpperCase()}`;
  }

  create(dto: CreateProjectDto) {
    const saveProject = async () => {
      const projectCode = dto.projectCode?.trim() || (await this.generateProjectCode());
      const project = this.projectRepo.create({
        ...dto,
        projectCode,
        status: dto.status || 'ACTIVE',
      });
      return this.projectRepo.save(project);
    };

    return saveProject();
  }

  findAll(organizationId: string, clientId?: string) {
    return this.projectRepo.find({
      where: {
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      relations: ['client'],
      order: { projectName: 'ASC' },
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async remove(id: string) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return this.projectRepo.remove(project);
  }
}
