import { IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { ProjectPriority, ProjectStatus } from '../entities/project.entity';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent?: number;

  @IsOptional()
  @IsString()
  estimatedEndDate?: string;
}
