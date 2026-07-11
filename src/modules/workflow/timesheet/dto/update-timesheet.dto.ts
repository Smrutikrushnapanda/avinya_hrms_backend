import { PartialType } from '@nestjs/mapped-types';
import { TimesheetEntryFieldsDto } from './create-timesheet.dto';

export class UpdateTimesheetDto extends PartialType(TimesheetEntryFieldsDto) {}
