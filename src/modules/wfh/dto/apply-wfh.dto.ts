import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApplicationEmailDto } from '../../request-email/dto/request-email.dto';

export class ApplyWfhDto extends ApplicationEmailDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
