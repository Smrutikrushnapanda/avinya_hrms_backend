import { IsOptional, IsNumber, IsBoolean, IsUUID, Min } from 'class-validator';

export class SetEmployeeWfhLimitDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateEmployeeWfhLimitDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
