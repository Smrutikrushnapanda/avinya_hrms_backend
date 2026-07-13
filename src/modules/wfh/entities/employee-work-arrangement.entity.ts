import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

export type WorkArrangementType = 'OFFICE' | 'HYBRID' | 'PERMANENT_REMOTE';

@Entity('employee_work_arrangements')
@Unique(['user'])
export class EmployeeWorkArrangement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'arrangement_type', default: 'OFFICE' })
  arrangementType: WorkArrangementType = 'OFFICE';

  @Column({
    name: 'mandatory_office_days_per_month',
    type: 'int',
    nullable: true,
    comment:
      'HYBRID only. NULL = inherit organization_settings.hybridDefaultMandatoryOfficeDays',
  })
  mandatoryOfficeDaysPerMonth: number | null = null;

  @Column({
    name: 'auto_approve_wfh',
    default: true,
    comment:
      'When true, WFH requests within the computed quota are approved instantly without a manager step',
  })
  autoApproveWfh: boolean = true;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean = true;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
