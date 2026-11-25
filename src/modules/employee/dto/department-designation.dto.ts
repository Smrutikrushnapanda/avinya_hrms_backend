import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepartmentDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  code?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto, {
  skipNullProperties: false,
}) {}

export class CreateDesignationDto extends CreateDepartmentDto {
  @IsUUID()
  departmentId: string;
}

export class UpdateDesignationDto extends PartialType(CreateDesignationDto, {
  skipNullProperties: false,
}) {}
