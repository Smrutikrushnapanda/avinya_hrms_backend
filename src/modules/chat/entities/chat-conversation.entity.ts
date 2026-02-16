import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { ChatParticipant } from './chat-participant.entity';
import { ChatMessage } from './chat-message.entity';

export type ChatConversationType = 'DIRECT' | 'GROUP';

@Entity('chat_conversations')
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'type', type: 'varchar', length: 20, default: 'DIRECT' })
  type: ChatConversationType;

  @Column({ name: 'title', type: 'varchar', length: 150, nullable: true })
  title?: string;

  @OneToMany(() => ChatParticipant, (p) => p.conversation, { cascade: true })
  participants: ChatParticipant[];

  @OneToMany(() => ChatMessage, (m) => m.conversation, { cascade: true })
  messages: ChatMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
