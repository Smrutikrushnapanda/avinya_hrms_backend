import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  IsArray,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePollQuestionDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsIn(['single_choice', 'multiple_choice']) // Extend if needed
  questionType: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  options: string[];
}

export class CreatePollDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  createdBy: string;

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePollQuestionDto)
  questions: CreatePollQuestionDto[];
}
