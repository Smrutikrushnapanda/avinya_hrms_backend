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

@Entity({ name: 'organization_resignation_settings' })
@Unique(['organizationId'])
export class OrganizationResignationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @OneToOne(() => Organization, (organization) => organization.resignationSettings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'policy', type: 'text', nullable: true })
  policy?: string | null;

  @Column({ name: 'notice_period_days', type: 'int', default: 30 })
  noticePeriodDays: number;

  @Column({ name: 'allow_early_relieving_by_admin', type: 'boolean', default: false })
  allowEarlyRelievingByAdmin: boolean;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;
}
