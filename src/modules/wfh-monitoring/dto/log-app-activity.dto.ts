import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsDateString,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AppActivityEntryDto {
  @IsString()
  @IsNotEmpty()
  appName: string;

  @IsOptional()
  @IsString()
  windowTitle?: string;

  @IsInt()
  @Min(0)
  keystrokeCount: number;

  @IsInt()
  @Min(0)
  mouseClicks: number;

  @IsInt()
  @Min(1)
  durationSeconds: number;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class LogAppActivityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AppActivityEntryDto)
  entries: AppActivityEntryDto[];
}
