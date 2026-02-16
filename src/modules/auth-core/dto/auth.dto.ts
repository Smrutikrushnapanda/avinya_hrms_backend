import { IsNotEmpty, IsOptional, IsString } from "class-validator";

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
