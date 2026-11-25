import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/\S/, { message: 'Leave reason is required.' })
  reason: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  duration?: number;
}
