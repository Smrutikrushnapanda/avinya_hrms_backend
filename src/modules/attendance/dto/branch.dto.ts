import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ArrayNotEmpty,
  IsIn,
  Max,
  Min,
} from 'class-validator';

const toOptionalNumber = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
};

export class CreateBranchDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Branch name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '09:00:00', description: 'Work start time (HH:mm:ss)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  workStartTime?: string;

  @ApiPropertyOptional({ example: '18:00:00', description: 'Work end time (HH:mm:ss)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  workEndTime?: string;

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

  @ApiPropertyOptional({
    example: '14:00:00',
    description: 'Half-day cutoff time (HH:mm:ss)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}:\d{2}$/)
  halfDayCutoffTime?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5, 6],
    description: 'Working days where 0=Sun, 1=Mon ... 6=Sat',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  workingDays?: number[];

  @ApiPropertyOptional({
    example: { '1': [2, 4], '6': [2, 4] },
    description: 'Weekday off rules: key=weekday (1=Mon..6=Sat), value=weeks (1-5)',
  })
  @IsOptional()
  @IsObject()
  weekdayOffRules?: Record<string, number[]>;

  @ApiPropertyOptional({ example: 20.3494624, description: 'Office latitude' })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  officeLatitude?: number;

  @ApiPropertyOptional({ example: 85.8078853, description: 'Office longitude' })
  @IsOptional()
  @Transform(toOptionalNumber)
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

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @ApiPropertyOptional({ description: 'Branch UUID' })
  @IsUUID()
  @IsOptional()
  id?: string;
}
