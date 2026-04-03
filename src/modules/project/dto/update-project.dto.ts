import { IsString, IsOptional, IsIn, IsInt, Min, Max, IsNumber } from 'class-validator';
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  projectCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;
}
