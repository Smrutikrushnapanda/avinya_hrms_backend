import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

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
}
