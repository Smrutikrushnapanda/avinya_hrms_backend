import {
  IsUUID,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateEmployeeDto {
  @ApiProperty({ description: 'Employee ID being validated/updated' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ description: 'Proposed manager ID (reportingTo)' })
  @IsUUID()
  reportingTo: string;

  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  organizationId: string;
}

