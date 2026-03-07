import { IsString, IsOptional, IsIn, IsInt, Min, Max, IsArray, IsUUID } from 'class-validator';
import { ProjectPriority, ProjectStatus } from '../entities/project.entity';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['planning', 'active', 'on_hold', 'completed'])
  status?: ProjectStatus;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: ProjectPriority;

  @IsOptional()
  @IsString()
  estimatedEndDate?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  memberUserIds?: string[];
}
