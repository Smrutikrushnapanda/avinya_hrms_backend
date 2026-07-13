import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { WorkArrangementType } from '../entities/employee-work-arrangement.entity';

const ARRANGEMENT_TYPES: WorkArrangementType[] = [
  'OFFICE',
  'HYBRID',
  'PERMANENT_REMOTE',
];

export class SetEmployeeWorkArrangementDto {
  @IsUUID()
  userId!: string;

  @IsIn(ARRANGEMENT_TYPES)
  arrangementType!: WorkArrangementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mandatoryOfficeDaysPerMonth?: number;

  @IsOptional()
  @IsBoolean()
  autoApproveWfh?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class UpdateEmployeeWorkArrangementDto {
  @IsOptional()
  @IsIn(ARRANGEMENT_TYPES)
  arrangementType?: WorkArrangementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mandatoryOfficeDaysPerMonth?: number;

  @IsOptional()
  @IsBoolean()
  autoApproveWfh?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
