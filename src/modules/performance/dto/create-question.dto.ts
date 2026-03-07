import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  question: string;

  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}
