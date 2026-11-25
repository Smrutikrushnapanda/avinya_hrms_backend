import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Organization } from '../../auth-core/entities/organization.entity';
import { LeaveType } from '../../leave/entities/leave-type.entity';

export enum RequestEmailKind {
  LEAVE = 'leave',
  WFH = 'wfh',
}

@Entity('request_email_templates')
@Index('IDX_request_email_templates_scope', [
  'organizationId',
  'kind',
  'leaveTypeId',
])
@Index('UQ_request_email_default_leave', ['organizationId', 'leaveTypeId'], {
  unique: true,
  where: `"enabled" = true AND "is_default" = true AND "kind" = 'leave'`,
})
@Index('UQ_request_email_default_wfh', ['organizationId'], {
  unique: true,
  where: `"enabled" = true AND "is_default" = true AND "kind" = 'wfh'`,
})
@Check(
  'CHK_request_email_template_kind',
  `("kind" = 'leave' AND "leave_type_id" IS NOT NULL) OR ("kind" = 'wfh' AND "leave_type_id" IS NULL)`,
)
export class RequestEmailTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId: string;
  @Column({ type: 'varchar', length: 10 }) kind: RequestEmailKind;
  @Column({ name: 'leave_type_id', type: 'uuid', nullable: true }) leaveTypeId:
    | string
    | null;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'jsonb' }) recipients: string[];
  @Column({ name: 'subject_template', type: 'varchar', length: 200 })
  subjectTemplate: string;
  @Column({ name: 'body_template', type: 'text' }) bodyTemplate: string;
  @Column({ default: true }) enabled: boolean;
  @Column({ name: 'is_default', default: false }) isDefault: boolean;
  @VersionColumn() version: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_request_email_template_org',
  })
  organization: Organization;
  @ManyToOne(() => LeaveType, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'leave_type_id',
    foreignKeyConstraintName: 'FK_request_email_template_leave_type',
  })
  leaveType: LeaveType | null;
}
