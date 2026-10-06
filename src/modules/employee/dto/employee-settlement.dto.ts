import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SettlementStatus } from '../entities/employee-settlement.entity';

export class SaveSettlementDto {
  @IsString()
  @IsOptional()
  resignationRequestId?: string;

  @IsDateString()
  @IsOptional()
  resignationDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  noticePeriodDays?: number;

  @IsDateString()
  @IsOptional()
  lastWorkingDate?: string;

  @IsString()
  @IsOptional()
  reasonForLeaving?: string;

  // Earnings
  @IsNumber()
  @IsOptional()
  salaryDue?: number;

  @IsNumber()
  @IsOptional()
  pendingSalary?: number;

  @IsNumber()
  @IsOptional()
  leaveEncashmentDays?: number;

  @IsNumber()
  @IsOptional()
  leaveEncashmentAmount?: number;

  @IsNumber()
  @IsOptional()
  bonusAmount?: number;

  @IsNumber()
  @IsOptional()
  incentiveAmount?: number;

  @IsNumber()
  @IsOptional()
  otherPayableAmount?: number;

  // Deductions
  @IsNumber()
  @IsOptional()
  noticePeriodRecoveryAmount?: number;

  @IsNumber()
  @IsOptional()
  loanRecoveryAmount?: number;

  @IsNumber()
  @IsOptional()
  assetDeductionAmount?: number;

  @IsNumber()
  @IsOptional()
  otherDeductionsAmount?: number;

  @IsString()
  @IsOptional()
  deductionsRemarks?: string;

  @IsEnum(SettlementStatus)
  @IsOptional()
  status?: SettlementStatus;

  @IsString()
  @IsOptional()
  preparedBy?: string;

  @IsString()
  @IsOptional()
  hrApprovalName?: string;

  @IsString()
  @IsOptional()
  financeApprovalName?: string;

  @IsDateString()
  @IsOptional()
  approvalDate?: string;

  @IsBoolean()
  @IsOptional()
  employeeDeclarationAcknowledged?: boolean;

  @IsString()
  @IsOptional()
  remarks?: string;
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
