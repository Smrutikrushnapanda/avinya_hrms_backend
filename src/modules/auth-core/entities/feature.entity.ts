import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OrganizationFeature } from './organization-feature.entity';

@Entity({ name: 'features' })
export class Feature {
  @PrimaryGeneratedColumn('uuid', { name: 'feature_id' })
  id: string;

  @Column({ name: 'feature_name', unique: true })
  featureName: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_on', type: 'timestamptz' })
  createdOn: Date;

  @Column({ name: 'updated_by', type: 'varchar', nullable: true })
  updatedBy?: string;

  @UpdateDateColumn({ name: 'updated_on', type: 'timestamptz' })
  updatedOn: Date;

  @OneToMany(() => OrganizationFeature, (of) => of.feature)
  organizationFeatures: OrganizationFeature[];
}
