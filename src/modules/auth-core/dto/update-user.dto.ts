import { PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each roleId must be a valid UUID' })
  roleIds?: string[];

  // Required when a user changes their OWN password (isSelf) — verified
  // against the stored hash before applying the new one, so a leaked JWT
  // alone can't silently take over an account.
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
