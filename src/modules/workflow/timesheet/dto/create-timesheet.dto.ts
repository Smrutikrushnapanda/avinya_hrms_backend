import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTimesheetDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsString()
  workDescription: string;

  @IsOptional()
  @IsString()
  employeeRemark?: string;
}
