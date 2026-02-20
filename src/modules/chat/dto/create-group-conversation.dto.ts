import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateGroupConversationDto {
  @ApiProperty({ example: 'Design Team' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  title: string;

  @ApiProperty({ type: [String], description: 'User IDs of participants (excluding creator)' })
  @IsArray()
  @IsUUID('all', { each: true })
  userIds: string[];
}
