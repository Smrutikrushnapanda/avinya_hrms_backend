import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsEnum,
} from 'class-validator';

export class CreateSalaryStructureDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsString()
  name?: string;

  // Earnings
  @IsNumber()
  basic: number;

  @IsNumber()
  hra: number;

  @IsNumber()
  conveyance: number;

  @IsNumber()
  otherAllowances: number;

  // Deductions
  @IsNumber()
  pf: number;

  @IsNumber()
  tds: number;

  // Effective dates
  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSalaryStructureDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Earnings
  @IsOptional()
  @IsNumber()
  basic?: number;

  @IsOptional()
  @IsNumber()
  hra?: number;

  @IsOptional()
  @IsNumber()
  conveyance?: number;

  @IsOptional()
  @IsNumber()
  otherAllowances?: number;

  // Deductions
  @IsOptional()
  @IsNumber()
  pf?: number;

  @IsOptional()
  @IsNumber()
  tds?: number;

  // Effective dates
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
