import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  Min,
} from 'class-validator';

export enum WorkSource {
  CLIENT = 'client',
  INTERNAL = 'internal',
}

export class CreateAssignWorkDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(WorkSource)
  source?: WorkSource;

  @IsOptional()
  @IsString()
  otherProjectName?: string;

  @IsString()
  title: string;

  @IsString()
  @Matches(/\S/, { message: 'Description is required' })
  description: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedToUserIds?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateWorkProgressDto {
  @IsOptional()
  @IsEnum([
    'pending',
    'in_progress',
    'issue',
    'completed',
    'cancelled',
    'resolved',
  ])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  completedPointIndexes?: number[];

  @IsOptional()
  @IsString()
  workReport?: string;

  @IsOptional()
  @IsEnum(WorkSource)
  source?: WorkSource;
}
