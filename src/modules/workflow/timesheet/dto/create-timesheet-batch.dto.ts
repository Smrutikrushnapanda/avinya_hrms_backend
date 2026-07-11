import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TimesheetEntryFieldsDto } from './create-timesheet.dto';

export class CreateTimesheetBatchDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryFieldsDto)
  entries: TimesheetEntryFieldsDto[];
}
