import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('performance_settings')
export class PerformanceSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean;

  @Column({ name: 'require_hr_approval', type: 'boolean', default: false })
  requireHrApproval: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
