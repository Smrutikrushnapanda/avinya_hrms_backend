import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('renewal_email_logs')
export class RenewalEmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'organization_name', length: 255 })
  organizationName: string;

  @Column({ name: 'recipient_email', length: 255 })
  recipientEmail: string;

  @Column({ name: 'subject', length: 500 })
  subject: string;

  @Column({ name: 'email_type', length: 50, default: 'RENEWAL_REMINDER' })
  emailType: string;

  @Column({ name: 'sent_by', length: 255, default: 'superadmin' })
  sentBy: string;

  @Column({ name: 'subscription_end_date', type: 'timestamp', nullable: true })
  subscriptionEndDate: Date | null = null;

  @Column({ name: 'plan_name', type: 'varchar', length: 255, nullable: true })
  planName: string | null;

  @Column({ name: 'plan_price', type: 'int', nullable: true })
  planPrice: number | null;

  @Column({ name: 'status', type: 'varchar', length: 50, default: 'SENT' })
  status: string;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
