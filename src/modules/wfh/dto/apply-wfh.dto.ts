import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ApplyWfhDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
