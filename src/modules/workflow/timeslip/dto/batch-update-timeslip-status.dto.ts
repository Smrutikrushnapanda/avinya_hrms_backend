import { IsArray, ArrayNotEmpty, IsEnum, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchUpdateTimeslipStatusDto {
  @ApiProperty({
    description: 'Array of timeslip IDs to update',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3']
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  timeslipIds: string[];

  @ApiProperty({
    description: 'New status to set for all timeslips',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    example: 'APPROVED'
  })
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @ApiProperty({
    description: 'Optional: Specific approver ID for workflow-based updates. If not provided, performs admin override.',
    type: String,
    required: false,
    example: 'approver-uuid-here'
  })
  @IsOptional()
  @IsUUID()
  approverId?: string;
}
