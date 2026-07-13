import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OfficeTripType } from '../entities/office-trip-request.entity';

class OfficeTripAttachmentDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class CreateOfficeTripDto {
  @IsEnum(OfficeTripType)
  tripType: OfficeTripType;

  @IsOptional()
  @IsString()
  tripTypeOther?: string;

  @IsString()
  @IsNotEmpty()
  fromDate: string;

  @IsString()
  @IsNotEmpty()
  toDate: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsString()
  @IsNotEmpty()
  clientOfficeName: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  purpose: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfficeTripAttachmentDto)
  attachments?: OfficeTripAttachmentDto[];

  @IsUUID()
  organizationId: string;
}

export class UpdateOfficeTripStatusDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  adminRemarks?: string;
}
