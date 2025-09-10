import { IsArray, ArrayNotEmpty, IsEnum, IsUUID } from 'class-validator';
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
}
