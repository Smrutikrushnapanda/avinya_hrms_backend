import { IsInt, IsOptional, IsString, IsUrl, Length, Min } from 'class-validator';

export class CreateProjectDocumentDto {
  @IsString()
  @Length(1, 255)
  title: string;

  @IsUrl()
  fileUrl: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @IsOptional()
  @IsString()
  @Length(1, 3000)
  description?: string;
}
