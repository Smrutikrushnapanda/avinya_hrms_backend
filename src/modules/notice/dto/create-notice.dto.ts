import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const NOTICE_ROLES = ['ADMIN', 'HR', 'EMPLOYEE'];

export class CreateNoticeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  bg_image_url?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(NOTICE_ROLES, { each: true })
  targetRoles?: string[];

  @IsISO8601()
  start_at: string;

  @IsISO8601()
  end_at: string;

  @IsOptional()
  @IsUUID()
  meetingId?: string;
}
