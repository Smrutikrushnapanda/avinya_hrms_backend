import { IsUUID, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum MissingType {
  IN = 'IN',
  OUT = 'OUT',
  BOTH = 'BOTH',
}

export class CreateTimeslipDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  organizationId: string; // Needed for workflow resolution

  @IsDateString()
  date: string;

  @IsEnum(MissingType)
  missingType: MissingType;

  @IsOptional()
  @IsDateString()
  correctedIn?: string;

  @IsOptional()
  @IsDateString()
  correctedOut?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}