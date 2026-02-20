import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'work_start_time', type: 'time', default: '09:00:00' })
  workStartTime!: string;

  @Column({ name: 'work_end_time', type: 'time', default: '18:00:00' })
  workEndTime!: string;

  @Column({ name: 'grace_minutes', type: 'int', default: 15 })
  graceMinutes!: number;

  @Column({ name: 'late_threshold_minutes', type: 'int', default: 30 })
  lateThresholdMinutes!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
