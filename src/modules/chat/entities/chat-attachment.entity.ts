import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_attachments')
export class ChatAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ChatMessage, (m) => m.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message: ChatMessage;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @Column({ name: 'url', type: 'text' })
  url: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName?: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType?: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number;

  @Column({ name: 'type', type: 'varchar', length: 20, default: 'file' })
  type: 'image' | 'file';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
