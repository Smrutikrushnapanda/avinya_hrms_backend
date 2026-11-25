import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SaveRequestEmailTemplateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((entry: unknown) =>
          typeof entry === 'string' ? entry.trim().toLowerCase() : entry,
        )
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  recipients: string[];
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  subjectTemplate: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) bodyTemplate: string;
  @IsBoolean() enabled: boolean;
  @IsBoolean() isDefault: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class TestRequestEmailDto {
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((entry: unknown) =>
          typeof entry === 'string' ? entry.trim().toLowerCase() : entry,
        )
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  @MaxLength(254, { each: true })
  recipients: string[];
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  subjectTemplate: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) bodyTemplate: string;
}

export class RequestEmailDraftDto {
  @IsUUID() templateId: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  subject: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) body: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint: string;
}

export class ApplicationEmailFieldsDto {
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(5000) reason?: string;
  @IsOptional() @IsNumber() @IsIn([0.5, 1]) duration?: number;
}

export class PreviewRequestEmailDto extends ApplicationEmailFieldsDto {
  @IsOptional() @IsUUID() templateId?: string;
}

export class ApplicationEmailDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => RequestEmailDraftDto)
  emailDraft?: RequestEmailDraftDto;
}
