import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Branch name' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '09:00:00', description: 'Work start time (HH:mm:ss)' })
  @IsString()
  @Matches(/^\\d{2}:\\d{2}:\\d{2}$/)
  workStartTime!: string;

  @ApiProperty({ example: '18:00:00', description: 'Work end time (HH:mm:ss)' })
  @IsString()
  @Matches(/^\\d{2}:\\d{2}:\\d{2}$/)
  workEndTime!: string;

  @ApiPropertyOptional({ example: 15, description: 'Grace minutes for late tolerance' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutes?: number;

  @ApiPropertyOptional({ example: 30, description: 'Late threshold in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  lateThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 20.3494624, description: 'Office latitude' })
  @IsOptional()
  @IsNumber()
  officeLatitude?: number;

  @ApiPropertyOptional({ example: 85.8078853, description: 'Office longitude' })
  @IsOptional()
  @IsNumber()
  officeLongitude?: number;

  @ApiPropertyOptional({ example: 150, description: 'Allowed GPS radius (meters) for this branch' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  allowedRadiusMeters?: number;

  @ApiPropertyOptional({
    description: 'Alternate geofences for this branch',
    example: [
      { latitude: 20.35, longitude: 85.81, radiusMeters: 120, label: 'Gate A' },
      { latitude: 20.36, longitude: 85.82, radiusMeters: 80, label: 'Warehouse' },
    ],
  })
  @IsOptional()
  @IsArray()
  altLocations?: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    label?: string;
  }[];

  @ApiPropertyOptional({ example: true, description: 'Whether branch is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBranchDto extends CreateBranchDto {
  @ApiPropertyOptional({ description: 'Branch UUID' })
  @IsUUID()
  @IsOptional()
  id?: string;
}
