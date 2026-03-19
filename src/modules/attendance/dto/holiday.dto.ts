import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateHolidayDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsDateString()
  date: string | Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOptional?: boolean;
}

export class UpdateHolidayDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsDateString()
  date?: string | Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOptional?: boolean;
}
