import { IsString, IsNotEmpty, IsOptional, IsDateString, IsNumber, IsArray, IsUUID } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  scheduledAt: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  participantIds?: string[];

  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @IsUUID()
  @IsNotEmpty()
  createdById: string;

}

export class UpdateMeetingDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsNumber()
  @IsOptional()
  durationMinutes?: number;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  participantIds?: string[];

  @IsString()
  @IsOptional()
  status?: string;

}

export class SendMeetingNotificationDto {
  @IsUUID()
  @IsNotEmpty()
  meetingId: string;
}

