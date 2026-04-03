import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateProjectTestSheetTabDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  orderIndex?: number;
}
