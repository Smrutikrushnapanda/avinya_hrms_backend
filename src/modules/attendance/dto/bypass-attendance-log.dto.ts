import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAttendanceLogDto } from './create-attendance-log.dto';

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return Boolean(value);
};

export class BypassAttendanceLogDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ description: 'Target user UUID (employee to record attendance for)' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Source of punch',
    enum: ['mobile', 'web', 'biometric', 'wifi', 'manual'],
    default: 'manual',
  })
  @IsIn(['mobile', 'web', 'biometric', 'wifi', 'manual'])
  source: 'mobile' | 'web' | 'biometric' | 'wifi' | 'manual' = 'manual';

  @ApiProperty({
    description: 'Explicit punch type for bypass',
    enum: ['check-in', 'check-out'],
  })
  @IsIn(['check-in', 'check-out'])
  type: 'check-in' | 'check-out';

  @ApiProperty({
    description: 'Punch timestamp (ISO format)',
    example: '2025-07-12T09:45:00.000Z',
  })
  @IsDateString()
  timestamp: string;

  @ApiPropertyOptional({
    description: 'Latitude of the user',
    example: 20.3494624,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude of the user',
    example: 85.8078853,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Location address',
    example: 'DLF Cybercity, Bhubaneswar',
  })
  @IsOptional()
  @IsString()
  locationAddress?: string;

  @ApiPropertyOptional({
    description: 'Connected WiFi SSID',
    example: 'Airtel_Pstech world',
  })
  @IsOptional()
  @IsString()
  wifiSsid?: string;

  @ApiPropertyOptional({
    description: 'Connected WiFi BSSID (MAC/IP)',
    example: '106.215.147.214',
  })
  @IsOptional()
  @IsString()
  wifiBssid?: string;

  @ApiPropertyOptional({
    description: 'Biometric device UUID if biometric used',
  })
  @IsOptional()
  @IsUUID()
  biometricDeviceId?: string;

  @ApiPropertyOptional({
    description: 'Device information',
    example: 'Admin bypass entry',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @ApiPropertyOptional({
    description: 'Reason for bypass entry (for audit trail)',
    example: 'Manual correction by admin - employee forgot to punch',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Deprecated: ignored by the server. Validation is always enforced using the ' +
      "organization's stored AttendanceSettings, never the client's claim.",
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBoolean(value))
  enableFaceValidation?: boolean;

  @ApiPropertyOptional({
    description: 'Deprecated: ignored by the server. See enableFaceValidation.',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBoolean(value))
  enableWifiValidation?: boolean;

  @ApiPropertyOptional({
    description: 'Deprecated: ignored by the server. See enableFaceValidation.',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBoolean(value))
  enableGPSValidation?: boolean;
}