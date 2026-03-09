import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OrganizationFeature } from './organization-feature.entity';
import { OrganizationMobileHeaderSettings } from './organization-mobile-header-settings.entity';
import { OrganizationResignationSettings } from './organization-resignation-settings.entity';

@Entity({ name: 'organizations' })
export class Organization {
  @PrimaryGeneratedColumn('uuid', { name: 'organization_id' })
  id: string;

  @Column({ name: 'organization_name', unique: true })
  organizationName: string;

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email?: string;

  @Column({ name: 'hr_mail', type: 'varchar', nullable: true })
  hrMail?: string;

  @Column({ name: 'phone', type: 'varchar', nullable: true })
  phone?: string;

  @Column({ name: 'address', type: 'text', nullable: true })
  address?: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl?: string;

  @Column({ name: 'site_url', type: 'text', nullable: true })
  siteUrl?: string;

  @Column({ name: 'landing_link', type: 'text', nullable: true })
  landingLink?: string;

  @Column({ name: 'enable_gps_validation', type: 'boolean', default: true })
  enableGpsValidation: boolean;

  @Column({ name: 'enable_wifi_validation', type: 'boolean', default: false })
  enableWifiValidation: boolean;

  @Column({ name: 'wfh_approval_mode', type: 'varchar', length: 20, default: 'MANAGER' })
  wfhApprovalMode: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @Column({ name: 'updated_by', type: 'varchar', nullable: true })
  updatedBy?: string;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToMany(() => OrganizationFeature, (of) => of.organization)
  organizationFeatures: OrganizationFeature[];

  @OneToOne(() => OrganizationMobileHeaderSettings, (settings) => settings.organization, {
    eager: true,
  })
  mobileHeaderSettings?: OrganizationMobileHeaderSettings;

  @OneToOne(() => OrganizationResignationSettings, (settings) => settings.organization, {
    eager: true,
  })
  resignationSettings?: OrganizationResignationSettings;
}
