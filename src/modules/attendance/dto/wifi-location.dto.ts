import { IsUUID, IsString, IsOptional, IsNumber } from 'class-validator';
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
