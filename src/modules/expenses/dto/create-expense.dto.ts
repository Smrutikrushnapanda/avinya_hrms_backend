import { IsNotEmpty, IsOptional, IsString, IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  expenseDate: string;

  @IsString()
  @IsNotEmpty()
  expenseType: string;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsUUID()
  organizationId: string;
}

export class UpdateExpenseStatusDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsString()
  adminRemarks?: string;
}
