import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { ChatConversation } from './chat-conversation.entity';
import { ChatAttachment } from './chat-attachment.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ChatConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ChatConversation;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @Column({ name: 'text', type: 'text', nullable: true })
  text?: string;

  // Client-generated UUID sent with the send request. Lets a retried send
  // (e.g. after a dropped response) be recognized as the same message
  // instead of creating a duplicate row — see ChatService.sendMessage.
  @Column({
    name: 'client_message_id',
    type: 'varchar',
    nullable: true,
    unique: true,
  })
  clientMessageId?: string;

  @OneToMany(() => ChatAttachment, (a) => a.message, { cascade: true })
  attachments: ChatAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
