import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateDirectConversationDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
