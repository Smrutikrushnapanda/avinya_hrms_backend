import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateClientDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  clientName: string;

  @IsOptional()
  @IsString()
  clientCode?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
