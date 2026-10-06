import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class SaveSettlementDto {
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  resignationRequestId?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsDateString()
  resignationDate?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  @Min(0)
  noticePeriodDays?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsDateString()
  lastWorkingDate?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  reasonForLeaving?: string | null;

  // Earnings
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  salaryDue?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  pendingSalary?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  leaveEncashmentDays?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  leaveEncashmentAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  bonusAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  incentiveAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  otherPayableAmount?: number | null;

  // Deductions
  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  noticePeriodRecoveryAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  loanRecoveryAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  assetDeductionAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsNumber()
  otherDeductionsAmount?: number | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  deductionsRemarks?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  status?: string;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  preparedBy?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  hrApprovalName?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  financeApprovalName?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsDateString()
  approvalDate?: string | null;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined)
  @IsBoolean()
  employeeDeclarationAcknowledged?: boolean;

  @IsOptional()
  @ValidateIf((_, val) => val !== null && val !== undefined && val !== '')
  @IsString()
  remarks?: string | null;
}

export class AssignManagerDto {
  @IsString()
  @IsNotEmpty()
  managerId: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  projectSource?: 'internal' | 'client';

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  managerType?: 'PRIMARY' | 'SECONDARY';
}
