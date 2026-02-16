import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLogReportDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsString()
  actionType: string;

  @IsString()
  module: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
