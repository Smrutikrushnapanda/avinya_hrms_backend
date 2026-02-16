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

  @OneToMany(() => ChatAttachment, (a) => a.message, { cascade: true })
  attachments: ChatAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
