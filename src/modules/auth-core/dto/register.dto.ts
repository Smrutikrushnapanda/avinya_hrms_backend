import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  IsMobilePhone,
  IsDateString,
  IsUUID,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateRegisterDto {
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

  @IsMobilePhone('en-IN')
  mobileNumber: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  gender?: 'MALE' | 'FEMALE' | 'TRANSGENDER';

  @IsUUID()
  organizationId: string;

  @IsNumber()
  mobileOtpId: number;
  
  @IsNumber()
  @Min(100000)
  @Max(999999)
  mobileOTP: number;

  @IsNumber()
  emailOtpId:string;

  @IsNumber()
  @Min(100000)
  @Max(999999)
  emailOTP: number;
}