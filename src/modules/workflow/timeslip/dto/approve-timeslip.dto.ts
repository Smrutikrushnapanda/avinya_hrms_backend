import { IsUUID, IsEnum, IsOptional, IsString } from 'class-validator';

export class ApproveTimeslipDto {
  @IsUUID()
  approverId: string;

  @IsEnum(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  remarks?: string;
}
