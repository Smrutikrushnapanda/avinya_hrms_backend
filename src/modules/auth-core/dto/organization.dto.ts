import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  organizationName: string;

  @IsOptional()
  @IsString()
  email?: string;

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
  @IsUrl()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  landingLink?: string;

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
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  landingLink?: string;

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
