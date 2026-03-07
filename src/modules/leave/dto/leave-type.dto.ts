import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // null = all genders; 'female' = female only; 'male' = male only
  @IsOptional()
  @IsString()
  genderRestriction?: string | null;

  @IsOptional()
  @IsBoolean()
  isEarned?: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  genderRestriction?: string | null;

  @IsOptional()
  @IsBoolean()
  isEarned?: boolean;
}
