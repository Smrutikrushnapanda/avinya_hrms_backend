import {
  IsUUID,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToggleBreakDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ description: 'User UUID' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    description: 'Source of action',
    enum: ['mobile', 'web', 'biometric', 'wifi', 'manual'],
    default: 'web',
  })
  @IsOptional()
  @IsIn(['mobile', 'web', 'biometric', 'wifi', 'manual'])
  source?: 'mobile' | 'web' | 'biometric' | 'wifi' | 'manual';

  @ApiPropertyOptional({
    description: 'Action timestamp (ISO format). Defaults to server now.',
    example: '2025-07-12T13:15:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

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
    description: 'Device information',
    example: 'Android v12, Samsung M12',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
