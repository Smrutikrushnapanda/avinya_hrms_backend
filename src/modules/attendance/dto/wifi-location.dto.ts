import { IsUUID, IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWifiLocationDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  name: string;

  @IsString()
  ssid: string;

  @IsString()
  bssid: string;

  @IsOptional()
  @IsString()
  locationDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  allowedRadiusMeters?: number;
}

export class UpdateWifiLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ssid?: string;

  @IsOptional()
  @IsString()
  bssid?: string;

  @IsOptional()
  @IsString()
  locationDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  allowedRadiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
