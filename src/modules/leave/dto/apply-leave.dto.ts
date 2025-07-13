import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class ApplyLeaveDto {
  @IsNotEmpty()
  @IsString()
  leaveTypeId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  reason: string;
}