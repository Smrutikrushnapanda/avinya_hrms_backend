import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const ROLE_VALUES = ['ADMIN', 'HR', 'EMPLOYEE', 'SUPERADMIN'];
const PLAN_TIER_VALUES = ['BASIC', 'PRO', 'ENTERPRISE'];

export class CreateMenuItemDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  iconName?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsArray()
  @IsIn(ROLE_VALUES, { each: true })
  roles: string[];

  @IsArray()
  @IsIn(PLAN_TIER_VALUES, { each: true })
  planTiers: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  iconName?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ROLE_VALUES, { each: true })
  roles?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(PLAN_TIER_VALUES, { each: true })
  planTiers?: string[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
