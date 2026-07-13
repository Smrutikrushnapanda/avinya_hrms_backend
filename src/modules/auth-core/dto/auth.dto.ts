import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  userName: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @IsOptional()
  clientInfo?: any;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Email or user ID is required' })
  identifier: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Email or user ID is required' })
  identifier: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsString()
  @MinLength(3, { message: 'User ID must be at least 3 characters' })
  newUserName: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  newPassword: string;
}

export class SuperadminOtpRequestDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email: string;
}

export class SuperadminOtpVerifyDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otp: string;
}

export interface JwtPayload {
  userId: string;
  userName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dob: Date;
  email: string;
  mobileNumber: string | null;
  organizationId: string;
  roles: { id: string; roleName: string }[];
  permissions: { id: string; permissionName: string }[];
  mustChangePassword: boolean;
}
