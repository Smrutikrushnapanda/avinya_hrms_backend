import { IsNumber, IsOptional, IsString } from 'class-validator';

export class HeartbeatDto {
  @IsNumber()
  mouseEvents: number;

  @IsNumber()
  keyboardEvents: number;

  @IsNumber()
  tabSwitches: number;

  @IsOptional()
  @IsString()
  date?: string;
}
