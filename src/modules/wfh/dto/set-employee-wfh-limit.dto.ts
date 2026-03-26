import { IsOptional, IsNumber, IsBoolean, IsUUID, Min } from 'class-validator';

export class SetEmployeeWfhLimitDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateEmployeeWfhLimitDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerMonth?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
