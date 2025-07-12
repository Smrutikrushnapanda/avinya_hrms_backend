import {
  IsBoolean,
  IsOptional,
  IsString,
  IsObject,
  IsIP,
} from 'class-validator';

export class CreateUserActivityDto {
  @IsString()
  userId: string;

  @IsString()
  activityType: string;

  @IsOptional()
  @IsString()
  activityDescription?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @IsString()
  performedBy?: string;

  @IsOptional()
  @IsBoolean()
  isSuccess?: boolean;

  @IsOptional()
  @IsString()
  errorDetails?: string;
}
