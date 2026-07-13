import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { TimesheetApprovalStatus } from '../entities/timesheet.entity';

export class ApproveTimesheetDayDto {
  @IsUUID()
  employeeId: string;

  @IsDateString()
  date: string;

  @IsIn([TimesheetApprovalStatus.APPROVED, TimesheetApprovalStatus.REJECTED])
  approvalStatus:
    | TimesheetApprovalStatus.APPROVED
    | TimesheetApprovalStatus.REJECTED;

  @IsOptional()
  @IsString()
  remark?: string;
}
