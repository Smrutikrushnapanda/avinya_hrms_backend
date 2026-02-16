import { IsOptional, IsString } from 'class-validator';

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  text?: string;
}
