import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TimesheetWorkStatus } from '../entities/timesheet.entity';

/** Fields describing a single work-log row, shared by the single-create and batch-create DTOs. */
export class TimesheetEntryFieldsDto {
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

  @IsOptional()
  @IsString()
  moduleFeature?: string;

  @IsOptional()
  @IsString()
  pageScreen?: string;

  @IsString()
  workDescription: string;

  @IsOptional()
  @IsEnum(TimesheetWorkStatus)
  workStatus?: TimesheetWorkStatus;

  /** Auto-calculated from startTime/endTime on the client; server accepts an override if provided. */
  @IsOptional()
  @IsInt()
  @Min(1)
  workingMinutes?: number;

  @IsOptional()
  @IsString()
  employeeRemark?: string;
}

export class CreateTimesheetDto extends TimesheetEntryFieldsDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;
}
