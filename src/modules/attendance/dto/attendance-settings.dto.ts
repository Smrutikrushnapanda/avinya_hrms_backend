import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAttendanceSettingsDto {
  @ApiPropertyOptional({ description: 'Organization UUID' })
  @IsUUID()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ example: '09:00:00', description: 'Work start time (HH:mm:ss)' })
  @IsString()
  @IsOptional()
  workStartTime?: string;

  @ApiPropertyOptional({ example: '18:00:00', description: 'Work end time (HH:mm:ss)' })
  @IsString()
  @IsOptional()
  workEndTime?: string;

  @ApiPropertyOptional({ example: 15, description: 'Grace minutes for check-in' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(60)
  graceMinutes?: number;

  @ApiPropertyOptional({ example: 30, description: 'Late threshold in minutes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(120)
  lateThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 20.3494624, description: 'Office latitude' })
  @IsNumber()
  @IsOptional()
  officeLatitude?: number;

  @ApiPropertyOptional({ example: 85.8078853, description: 'Office longitude' })
  @IsNumber()
  @IsOptional()
  officeLongitude?: number;

  @ApiPropertyOptional({ example: 'Main Office', description: 'Office location name' })
  @IsString()
  @IsOptional()
  officeLocationName?: string;

  @ApiPropertyOptional({ example: 'DLF Cybercity, Bhubaneswar', description: 'Office location address' })
  @IsString()
  @IsOptional()
  officeLocationAddress?: string;

  @ApiPropertyOptional({ example: 100, description: 'Allowed radius in meters' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10000)
  allowedRadiusMeters?: number;

  @ApiPropertyOptional({ example: true, description: 'Enable GPS validation' })
  @IsBoolean()
  @IsOptional()
  enableGpsValidation?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Enable WiFi validation' })
  @IsBoolean()
  @IsOptional()
  enableWifiValidation?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Enable face validation' })
  @IsBoolean()
  @IsOptional()
  enableFaceValidation?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Enable check-in validation' })
  @IsBoolean()
  @IsOptional()
  enableCheckinValidation?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Enable check-out validation' })
  @IsBoolean()
  @IsOptional()
  enableCheckoutValidation?: boolean;

  @ApiPropertyOptional({ example: '14:00:00', description: 'Half day cutoff time' })
  @IsString()
  @IsOptional()
  halfDayCutoffTime?: string;

  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5, 6],
    description: 'Working days (0=Sun ... 6=Sat)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  workingDays?: number[];

  @ApiPropertyOptional({
    example: { "1": [2, 4], "5": [1], "6": [1, 3] },
    description: 'Weekday off rules: key=weekday (1=Mon..6=Sat), value=weeks (1-5)',
  })
  @IsObject()
  @IsOptional()
  weekdayOffRules?: Record<string, number[]>;
}

export class UpdateAttendanceSettingsDto extends CreateAttendanceSettingsDto {}
