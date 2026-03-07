import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  question: string;

  @IsString()
  answer: string;
}

export class SubmitReviewDto {
  @IsOptional()
  @IsString()
  employeeId?: string; // only required for manager reviews

  @IsOptional()
  @IsString()
  period?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  @IsOptional()
  @IsNumber()
  overallRating?: number;

  @IsOptional()
  @IsString()
  comments?: string;
}
