import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

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
