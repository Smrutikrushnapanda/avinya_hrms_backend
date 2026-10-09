import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateMyProfileDto {
  @ApiPropertyOptional({
    description: 'Employee phone/contact number',
    example: '9876543210',
  })
  @IsOptional()
  @IsString()
  @Length(5, 20)
  contactNumber?: string;

  @ApiPropertyOptional({
    description: 'Employee PAN number (masked in most views)',
    example: 'ABCDE1234F',
  })
  @IsOptional()
  @IsString()
  @Length(10, 20)
  panNumber?: string;

  @ApiPropertyOptional({
    description: 'Employee Aadhaar number (masked in most views)',
    example: '123412341234',
  })
  @IsOptional()
  @IsString()
  @Length(12, 20)
  aadhaarNumber?: string;
}
