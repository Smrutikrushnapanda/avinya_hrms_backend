import { IsString, IsUUID, MinLength } from 'class-validator';

export class ManagerRemarkDto {
  @IsUUID()
  managerId: string;

  @IsString()
  @MinLength(2)
  remark: string;
}
