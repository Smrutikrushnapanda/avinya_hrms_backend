import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OrganizationFeature } from './organization-feature.entity';

@Entity({ name: 'organizations' })
export class Organization {
  @PrimaryGeneratedColumn('uuid', { name: 'organization_id' })
  id: string;

  @Column({ name: 'organization_name', unique: true })
  organizationName: string;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl?: string;

  @Column({ name: 'site_url', type: 'text', nullable: true })
  siteUrl?: string;

  @Column({ name: 'landing_link', type: 'text', nullable: true })
  landingLink?: string;

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
}
