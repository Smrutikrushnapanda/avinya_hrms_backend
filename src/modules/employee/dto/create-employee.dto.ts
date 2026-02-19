import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsEmail,
  IsEnum,
  IsPhoneNumber,
  Length,
} from 'class-validator';

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
  reportingTo?: string;

  @IsString()
  @Length(1, 20)
  employeeCode: string;

  @IsString()
  @Length(3, 50)
  loginUserName: string;

  @IsString()
  @Length(6, 100)
  loginPassword: string;

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
