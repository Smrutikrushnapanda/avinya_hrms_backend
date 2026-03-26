import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateShiftDto {
  @ApiProperty({ description: 'Organization UUID' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Shift name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Optional shift description' })
  @IsOptional()
  @IsString()
  description?: string;

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

  @ApiPropertyOptional({ example: true, description: 'Whether shift is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) {
  @ApiPropertyOptional({ description: 'Shift UUID' })
  @IsUUID()
  @IsOptional()
  id?: string;
}
