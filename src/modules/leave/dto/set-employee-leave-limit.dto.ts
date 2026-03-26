import { IsOptional, IsNumber, IsBoolean, IsUUID, Min } from 'class-validator';

export class SetEmployeeLeaveLimitDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  leaveTypeId!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerRequest?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateEmployeeLeaveLimitDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerYear?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDaysPerRequest?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
