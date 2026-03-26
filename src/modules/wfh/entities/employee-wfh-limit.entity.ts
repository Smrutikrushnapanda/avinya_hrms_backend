import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('employee_wfh_limits')
export class EmployeeWfhLimitEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'int', nullable: true, comment: 'Maximum WFH days allowed per month. NULL = no limit' })
  maxDaysPerMonth: number | null = null;

  @Column({ type: 'int', nullable: true, comment: 'Maximum WFH days allowed per week. NULL = no limit' })
  maxDaysPerWeek: number | null = null;

  @Column({ type: 'int', nullable: true, comment: 'Maximum WFH days allowed per year. NULL = no limit' })
  maxDaysPerYear: number | null = null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean = true;
}
