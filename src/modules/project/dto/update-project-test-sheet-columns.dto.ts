import { IsObject } from 'class-validator';

export class UpdateProjectTestSheetColumnsDto {
  @IsObject()
  columnHeaders: Record<string, string>;
}

