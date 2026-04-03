import { IsString, Length } from 'class-validator';

export class CreateProjectTestSheetTabDto {
  @IsString()
  @Length(1, 120)
  name: string;
}
