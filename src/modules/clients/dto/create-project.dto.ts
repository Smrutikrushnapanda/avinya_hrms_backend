import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateProjectDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsString()
  projectName: string;

  @IsOptional()
  @IsString()
  projectCode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  additionalManagerIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  projectCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsBoolean()
  workOrderAssigned?: boolean;

  @IsOptional()
  @IsUUID()
  parentProjectId?: string;
}
