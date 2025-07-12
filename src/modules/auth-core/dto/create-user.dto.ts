import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  IsMobilePhone,
  IsDateString,
  IsUUID,
  IsIn,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsMobilePhone('en-IN', {}, { message: 'Mobile number must be a valid Indian mobile number' })
  mobileNumber: string;

  @IsOptional()
  @IsDateString({}, { message: 'DOB must be a valid ISO 8601 date string (YYYY-MM-DD)' })
  dob?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'TRANSGENDER'], { message: 'Gender must be MALE, FEMALE or TRANSGENDER' })
  gender?: 'MALE' | 'FEMALE' | 'TRANSGENDER';

  @IsUUID('4', { message: 'organizationId must be a valid UUID' })
  organizationId: string;
}