import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Message } from './entities/message.entity';
import { MessageRecipient } from './entities/message-recipient.entity';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { Employee } from '../employee/entities/employee.entity';
import { ChatParticipant } from '../chat/entities/chat-participant.entity';
import { ChatConversation } from '../chat/entities/chat-conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Message,
      MessageRecipient,
      Employee,
      ChatParticipant,
      ChatConversation,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
    }),
  ],
  providers: [MessageService, MessageGateway],
  controllers: [MessageController],
  exports: [MessageService, MessageGateway],
})
export class MessageModule {}
