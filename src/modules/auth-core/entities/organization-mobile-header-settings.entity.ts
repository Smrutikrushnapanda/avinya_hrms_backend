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

@Entity({ name: 'organization_mobile_header_settings' })
@Unique(['organizationId'])
export class OrganizationMobileHeaderSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @OneToOne(() => Organization, (organization) => organization.mobileHeaderSettings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'background_color', type: 'varchar', length: 20, nullable: true })
  backgroundColor?: string | null;

  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl?: string | null;

  @Column({ name: 'media_start_date', type: 'date', nullable: true })
  mediaStartDate?: string | null;

  @Column({ name: 'media_end_date', type: 'date', nullable: true })
  mediaEndDate?: string | null;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;
}
