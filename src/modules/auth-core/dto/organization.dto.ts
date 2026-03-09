import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';

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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  createdBy?: string;
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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  updatedBy?: string;
}
