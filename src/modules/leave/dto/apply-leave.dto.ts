import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApplicationEmailDto } from '../../request-email/dto/request-email.dto';

export class ApplyLeaveDto extends ApplicationEmailDto {
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
