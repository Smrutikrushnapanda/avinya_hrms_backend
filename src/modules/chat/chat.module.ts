import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import {
  ChatConversation,
  ChatParticipant,
  ChatMessage,
  ChatAttachment,
} from './entities';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatConversation,
      ChatParticipant,
      ChatMessage,
      ChatAttachment,
      User,
      UserPushToken,
    ]),
    MessageModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
