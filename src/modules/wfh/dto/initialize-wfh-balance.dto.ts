import { IsNotEmpty, IsNumber, IsUUID } from 'class-validator';

export class InitializeWfhBalanceDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  openingBalance: number;
}
