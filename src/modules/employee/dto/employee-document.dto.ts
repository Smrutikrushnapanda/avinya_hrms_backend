import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEmployeeDocumentDto {
  @IsString()
  @IsNotEmpty()
  documentName: string;

  @IsString()
  @IsOptional()
  documentCategory?: string;

  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @IsString()
  @IsOptional()
  fileSize?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsString()
  @IsOptional()
  remarks?: string;
}
