import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  organizationName: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  hrMail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  homeHeaderBackgroundColor?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaUrl?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaStartDate?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaEndDate?: string;

  @IsOptional()
  @IsUrl()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  landingLink?: string;

  @IsOptional()
  @IsString()
  resignationPolicy?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  resignationNoticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  allowEarlyRelievingByAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  enableGpsValidation?: boolean;

  @IsOptional()
  @IsBoolean()
  enableWifiValidation?: boolean;

  @IsOptional()
  @IsString()
  wfhApprovalMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  sessionStartMonth?: number;

  @IsOptional()
  @IsBoolean()
  leaveCarryForwardEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  wfhCarryForwardEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class StartTrialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  company: string;

  @IsString()
  @IsNotEmpty()
  teamSize: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  submittedAt?: string;
}

export class ChangeCredentialsDto {
  @IsOptional()
  @IsString()
  newUserName?: string;

  @IsOptional()
  @IsString()
  newPassword?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  hrMail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  homeHeaderBackgroundColor?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaUrl?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaStartDate?: string;

  @IsOptional()
  @IsString()
  homeHeaderMediaEndDate?: string;

  @IsOptional()
  @IsUrl()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  landingLink?: string;

  @IsOptional()
  @IsString()
  resignationPolicy?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  resignationNoticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  allowEarlyRelievingByAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  enableGpsValidation?: boolean;

  @IsOptional()
  @IsBoolean()
  enableWifiValidation?: boolean;

  @IsOptional()
  @IsString()
  wfhApprovalMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  sessionStartMonth?: number;

  @IsOptional()
  @IsBoolean()
  leaveCarryForwardEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  wfhCarryForwardEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  updatedBy?: string;
}
