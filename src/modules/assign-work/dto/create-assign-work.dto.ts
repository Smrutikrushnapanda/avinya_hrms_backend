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
  MaxLength,
} from 'class-validator';
import { PartialType, PickType } from '@nestjs/mapped-types';
import { TaskStatus } from '../../clients/entities/project-task.entity';

export enum WorkSource {
  CLIENT = 'client',
  INTERNAL = 'internal',
}

export class CreateAssignWorkDto {
  @IsOptional()
  @IsEnum(['regular', 'external'])
  assignmentKind?: 'regular' | 'external';

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  externalAssignerName?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  assignmentDate?: string;

  @IsOptional()
  @IsString()
  assignmentRemarks?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

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
  @Matches(/\S/)
  @MaxLength(500)
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
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateAssignWorkDto extends PartialType(
  PickType(CreateAssignWorkDto, [
    'title',
    'description',
    'assignedToUserId',
    'dueDate',
    'priority',
    'imageUrl',
    'externalAssignerName',
    'assignmentDate',
    'assignmentRemarks',
  ] as const),
  { skipNullProperties: false },
) {
  @IsOptional()
  @IsEnum(WorkSource)
  source?: WorkSource;
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
