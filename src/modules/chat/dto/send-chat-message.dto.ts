import { IsOptional, IsString } from 'class-validator';

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  text?: string;

  // Client-generated UUID identifying this send attempt. Passing the same
  // value on a retry lets the server recognize it and return the original
  // message instead of creating a duplicate.
  @IsOptional()
  @IsString()
  clientMessageId?: string;
}
