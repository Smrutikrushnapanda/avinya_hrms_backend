import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsUUID,
  IsOptional,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { RoleType } from '../enums/role-type.enum';

export class CreateRoleDto {
  @IsString({ message: 'Role name must be a string' })
  @IsNotEmpty({ message: 'Role name is required' })
  roleName: string;

  @IsOptional()
  @IsEnum(RoleType, {
    message: `Type must be one of: ${Object.values(RoleType).join(', ')}`,
  })
  type?: RoleType;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ValidateIf((o) => o.type === RoleType.CUSTOM)
  @IsUUID(undefined, { message: 'Invalid organization ID format' })
  organizationId?: string;

  @IsOptional()
  @IsString({ message: 'Created by must be a string' })
  createdBy?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'Role name must be a string' })
  roleName?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;
}

export class AssignRoleDto {
  @IsUUID(undefined, { message: 'Invalid user ID format' })
  userId: string;

  @IsArray({ message: 'roleIds must be an array of UUIDs' })
  @IsUUID('all', {
    each: true,
    message: 'Each roleId must be a valid UUID',
  })
  roleIds: string[];

  @IsOptional()
  @IsString()
  assignedBy?: string;
}

export class AssignDefaultRoleToOrgDto {
  @IsUUID(undefined, { message: 'Invalid role ID format' })
  roleId: string;

  @IsUUID(undefined, { message: 'Invalid organization ID format' })
  organizationId: string;

  @IsString()
  @IsNotEmpty({ message: 'Assigned by is required' })
  assignedBy: string;
}
