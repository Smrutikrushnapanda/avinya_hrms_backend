import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreatePolicyDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
