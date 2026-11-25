import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  RequestEmailKind,
  RequestEmailTemplate,
} from './request-email-template.entity';
import { Organization } from '../../auth-core/entities/organization.entity';
import { User } from '../../auth-core/entities/user.entity';

@Entity('request_email_deliveries')
@Index('UQ_request_email_delivery_request', ['kind', 'requestId'], {
  unique: true,
})
@Index('IDX_request_email_delivery_due', ['status', 'nextAttemptAt'])
export class RequestEmailDelivery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId: string;
  @Column({ type: 'varchar', length: 10 }) kind: RequestEmailKind;
  @Column({ name: 'request_id', type: 'uuid' }) requestId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'employee_name', type: 'varchar', length: 400 })
  employeeName: string;
  @Column({ name: 'template_id', type: 'uuid', nullable: true }) templateId:
    | string
    | null;
  @Column({ type: 'jsonb' }) recipients: string[];
  @Column({ name: 'reply_to', type: 'varchar', length: 254, nullable: true })
  replyTo: string | null;
  @Column({ type: 'varchar', length: 200 }) subject: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status:
    | 'pending'
    | 'sending'
    | 'sent'
    | 'failed';
  @Column({ default: 0 }) attempts: number;
  @Column({
    name: 'next_attempt_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  nextAttemptAt: Date;
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError:
    | string
    | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_request_email_delivery_org',
  })
  organization: Organization;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_request_email_delivery_user',
  })
  user: User;
  @ManyToOne(() => RequestEmailTemplate, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'template_id',
    foreignKeyConstraintName: 'FK_request_email_delivery_template',
  })
  template: RequestEmailTemplate | null;
}
