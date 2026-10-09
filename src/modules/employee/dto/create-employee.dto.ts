import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEmail,
  IsEnum,
  IsPhoneNumber,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateEmployeeDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  designationId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  reportingTo?: string;

  @IsString()
  @Length(1, 20)
  employeeCode: string;

  @IsOptional()
  @IsString()
  @Length(3, 50)
  loginUserName?: string;

  @IsString()
  @Length(6, 100)
  loginPassword: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsString()
  @Length(1, 100)
  firstName: string;

  @IsOptional()
  middleName?: string;

  @IsString()
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender?: 'MALE' | 'FEMALE' | 'OTHER';

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsDateString()
  dateOfJoining: string;

  @IsOptional()
  @IsDateString()
  dateOfExit?: string;

  @IsEmail()
  workEmail: string;

  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @IsOptional()
  @IsString()
  @Length(5, 20)
  contactNumber?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  aadharPhotoUrl?: string;

  @IsOptional()
  @IsString()
  panCardPhotoUrl?: string;

  @IsOptional()
  @IsString()
  passportPhotoUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, {
    message: 'PAN number must be 10 characters in the format ABCDE1234F',
  })
  panNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @Matches(/^[0-9]{12}$/, {
    message: 'Aadhaar number must be exactly 12 digits',
  })
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  employmentType?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'terminated'])
  status?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5)
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  emergencyContactPhone?: string;
}
