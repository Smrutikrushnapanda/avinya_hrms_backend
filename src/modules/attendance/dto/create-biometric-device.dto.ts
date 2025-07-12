import { IsUUID, IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBiometricDeviceDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  name: string;

  @IsString()
  deviceCode: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsString()
  locationAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
}