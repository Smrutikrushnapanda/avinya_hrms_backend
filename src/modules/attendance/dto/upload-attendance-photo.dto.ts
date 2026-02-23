import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

export enum AttendancePhotoType {
  CHECKIN = 'checkin',
  CHECKOUT = 'checkout',
}

export class UploadAttendancePhotoDto {
  @IsUUID()
  @IsNotEmpty()
  companyId: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(AttendancePhotoType)
  type: AttendancePhotoType;
}
