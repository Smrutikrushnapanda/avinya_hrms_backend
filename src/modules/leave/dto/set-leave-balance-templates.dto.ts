import { IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LeaveBalanceTemplateItemDto {
  @IsString()
  @IsNotEmpty()
  leaveTypeId: string;

  @IsInt()
  @Min(0)
  openingBalance: number;
}

export class SetLeaveBalanceTemplatesDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  employmentType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveBalanceTemplateItemDto)
  items: LeaveBalanceTemplateItemDto[];
}
