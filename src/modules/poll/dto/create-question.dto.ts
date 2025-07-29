import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export enum QuestionType {
  SINGLE = 'single_choice',
  MULTI = 'multiple_choice',
  RATING = 'rating',
  TEXT = 'text',
  RATING_TEXT = 'rating+text', // Add this
}

export class CreateQuestionDto {
  @IsString()
  question_text: string;

  @IsEnum(QuestionType)
  question_type: QuestionType;

  @IsBoolean()
  @IsOptional()
  is_required?: boolean;

  @IsInt()
  @IsOptional()
  question_order?: number;
}
