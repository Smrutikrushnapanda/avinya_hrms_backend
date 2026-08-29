import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  duration?: number;
}
