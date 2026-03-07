import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ResignationStatus } from '../entities/resignation-request.entity';

export class CreateResignationRequestDto {
  @IsString()
  @MinLength(10)
  message: string;

  @IsOptional()
  @IsDateString()
  proposedLastWorkingDay?: string;
}

export class ReviewResignationRequestDto {
  @IsEnum(ResignationStatus)
  status: ResignationStatus.APPROVED | ResignationStatus.REJECTED;

  @IsOptional()
  @IsString()
  hrRemarks?: string;

  @IsOptional()
  @IsDateString()
  approvedLastWorkingDay?: string;

  @IsOptional()
  @IsBoolean()
  allowEarlyRelieving?: boolean;
}

