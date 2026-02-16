import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, IsNumber } from 'class-validator';
import { PayrollStatus } from '../entities/payroll-record.entity';

export class CreatePayrollRecordDto {
  @IsUUID()
  organizationId: string;

  @IsUUID()
  employeeId: string;

  @IsString()
  payPeriod: string; // YYYY-MM

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsNumber()
  basic: number;

  @IsNumber()
  hra: number;

  @IsNumber()
  conveyance: number;

  @IsNumber()
  otherAllowances: number;

  @IsNumber()
  pf: number;

  @IsNumber()
  tds: number;

  @IsOptional()
  @IsEnum(['draft', 'processed', 'paid'])
  status?: PayrollStatus;
}

export class UpdatePayrollRecordDto {
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

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

  @IsOptional()
  @IsNumber()
  pf?: number;

  @IsOptional()
  @IsNumber()
  tds?: number;

  @IsOptional()
  @IsEnum(['draft', 'processed', 'paid'])
  status?: PayrollStatus;
}

export class SendPayslipDto {
  @IsOptional()
  @IsEnum(['email', 'in_app', 'both'])
  method?: 'email' | 'in_app' | 'both';
}

export class UpdatePayrollSettingsDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  primaryColor?: string;

  @IsOptional()
  @IsString()
  footerNote?: string;
}
