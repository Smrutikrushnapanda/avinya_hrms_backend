import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class ApproveLeaveDto {
  @IsBoolean()
  approve: boolean;

  @IsString()
  @IsNotEmpty()
  remarks: string;
}