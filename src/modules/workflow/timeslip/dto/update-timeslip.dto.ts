import { PartialType } from '@nestjs/mapped-types';
import { CreateTimeslipDto } from './create-timeslip.dto';
import { IsEnum, IsOptional } from 'class-validator';

export enum TimeslipStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class UpdateTimeslipDto extends PartialType(CreateTimeslipDto) {
  @IsOptional()
  @IsEnum(TimeslipStatus)
  status?: TimeslipStatus;
}