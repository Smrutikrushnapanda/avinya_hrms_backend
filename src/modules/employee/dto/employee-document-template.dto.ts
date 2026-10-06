import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { DocumentTemplateType } from '../entities/employee-document-template.entity';

export class CreateDocumentTemplateDto {
  @IsEnum(DocumentTemplateType)
  templateType: DocumentTemplateType;

  @IsString()
  @IsNotEmpty()
  templateName: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDocumentTemplateDto {
  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewLetterDto {
  @IsEnum(DocumentTemplateType)
  templateType: DocumentTemplateType;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  customContent?: string;
}
