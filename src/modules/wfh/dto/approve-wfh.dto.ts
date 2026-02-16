import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class ApproveWfhDto {
  @IsBoolean()
  approve: boolean;

  @IsString()
  @IsNotEmpty()
  remarks: string;
}
