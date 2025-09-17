import { IsArray, ArrayNotEmpty, IsEnum, IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchApproveSubmissionsDto {
  @ApiProperty({
    description: 'Array of TimeslipApproval IDs to update',
    type: [String],
    example: ['approval-uuid-1', 'approval-uuid-2']
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  approvalIds: string[];

  @ApiProperty({
    description: 'Action to take on the approvals',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED'
  })
  @IsEnum(['APPROVED', 'REJECTED'])
  action: 'APPROVED' | 'REJECTED';

  @ApiProperty({
    description: 'Optional remarks for the approval action',
    type: String,
    required: false,
    example: 'Approved after review'
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
