import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested, IsUUID } from 'class-validator';

class WfhBalanceTemplateItemDto {
  @IsNumber()
  openingBalance: number;
}

export class SetWfhBalanceTemplatesDto {
  @IsUUID()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  employmentType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WfhBalanceTemplateItemDto)
  items: WfhBalanceTemplateItemDto[];
}
