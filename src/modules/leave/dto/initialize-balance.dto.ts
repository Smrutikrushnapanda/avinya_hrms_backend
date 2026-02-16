import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class InitializeBalanceDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  leaveTypeId: string;

  @IsInt()
  @Min(0)
  openingBalance: number;
}
