import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateWfhAssignmentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  approverId: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsInt()
  @Min(1)
  level: number;
}
