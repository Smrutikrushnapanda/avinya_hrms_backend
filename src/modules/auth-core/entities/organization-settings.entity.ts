import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity({ name: 'organization_settings' })
@Unique(['organizationId'])
export class OrganizationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @OneToOne(() => Organization, (organization) => organization.settings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    name: 'home_header_background_color',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  homeHeaderBackgroundColor?: string | null;

  @Column({ name: 'home_header_media_url', type: 'text', nullable: true })
  homeHeaderMediaUrl?: string | null;

  @Column({
    name: 'home_header_media_start_date',
    type: 'date',
    nullable: true,
  })
  homeHeaderMediaStartDate?: string | null;

  @Column({ name: 'home_header_media_end_date', type: 'date', nullable: true })
  homeHeaderMediaEndDate?: string | null;

  @Column({ name: 'resignation_policy', type: 'text', nullable: true })
  resignationPolicy?: string | null;

  @Column({ name: 'resignation_notice_period_days', type: 'int', default: 30 })
  resignationNoticePeriodDays: number;

  @Column({
    name: 'allow_early_relieving_by_admin',
    type: 'boolean',
    default: false,
  })
  allowEarlyRelievingByAdmin: boolean;

  @Column({ name: 'session_start_month', type: 'int', default: 4 })
  sessionStartMonth: number;

  @Column({
    name: 'leave_carry_forward_enabled',
    type: 'boolean',
    default: false,
  })
  leaveCarryForwardEnabled: boolean;

  @Column({
    name: 'wfh_carry_forward_enabled',
    type: 'boolean',
    default: false,
  })
  wfhCarryForwardEnabled: boolean;

  @Column({
    name: 'hybrid_default_mandatory_office_days',
    type: 'int',
    default: 15,
  })
  hybridDefaultMandatoryOfficeDays: number;

  @Column({
    name: 'wfh_monitor_reminder_enabled',
    type: 'boolean',
    default: true,
  })
  wfhMonitorReminderEnabled: boolean;

  @Column({
    name: 'wfh_monitor_reminder_interval_minutes',
    type: 'int',
    default: 30,
  })
  wfhMonitorReminderIntervalMinutes: number;

  @Column({
    name: 'wfh_monitor_reminder_max_per_day',
    type: 'int',
    nullable: true,
    comment: 'NULL = keep reminding until the monitoring session starts',
  })
  wfhMonitorReminderMaxPerDay?: number | null;

  @Column({
    name: 'wfh_monitor_reminder_email_cutoff_minutes',
    type: 'int',
    default: 120,
    comment:
      'Minutes after shift start before a one-time email reminder is sent if no session has started',
  })
  wfhMonitorReminderEmailCutoffMinutes: number;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;
}
