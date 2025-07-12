import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Column,
  Unique,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Feature } from './feature.entity';

@Entity({ name: 'organization_features' })
@Unique(['organization', 'feature']) // Prevent duplicate assignments
export class OrganizationFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id', referencedColumnName: 'id' })
  organization: Organization;

  @ManyToOne(() => Feature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id', referencedColumnName: 'id' })
  feature: Feature;

  @Column({ name: 'assigned_by', type: 'varchar', nullable: true })
  assignedBy?: string;

  @CreateDateColumn({ name: 'assigned_on', type: 'timestamptz' })
  assignedOn: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}