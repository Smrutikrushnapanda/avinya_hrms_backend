import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // Required when a user changes their OWN password (isSelf) — verified
  // against the stored hash before applying the new one, so a leaked JWT
  // alone can't silently take over an account.
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
