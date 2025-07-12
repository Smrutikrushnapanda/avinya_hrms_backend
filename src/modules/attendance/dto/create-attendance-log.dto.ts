import {
  IsUUID,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsIn,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceLogDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ description: 'User UUID' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: 'Source of punch',
    enum: ['mobile', 'web', 'biometric', 'wifi', 'manual'],
  })
  @IsIn(['mobile', 'web', 'biometric', 'wifi', 'manual'])
  source: 'mobile' | 'web' | 'biometric' | 'wifi' | 'manual';

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
    example: 'Android v12, Samsung M12',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @ApiProperty({
    description: 'Enable face validation',
    type: Boolean,
    example: true,
  })
  @IsBoolean()
  @Type(() => Boolean)
  enableFaceValidation: boolean;

  @ApiProperty({
    description: 'Enable WiFi validation',
    type: Boolean,
    example: true,
  })
  @IsBoolean()
  @Type(() => Boolean)
  enableWifiValidation: boolean;

  @ApiProperty({
    description: 'Enable GPS validation',
    type: Boolean,
    example: true,
  })
  @IsBoolean()
  @Type(() => Boolean)
  enableGPSValidation: boolean;
}