import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from 'src/modules/auth-core/entities/user.entity';
import { LeaveType } from './leave-type.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

@Entity('employee_leave_limits')
@Unique(['user', 'leaveType'])
export class EmployeeLeaveLimitEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => LeaveType)
  @JoinColumn({ name: 'leave_type_id' })
  leaveType!: LeaveType;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'int', nullable: true, comment: 'Maximum days allowed per year. NULL = no limit' })
  maxDaysPerYear: number | null = null;

  @Column({ type: 'int', nullable: true, comment: 'Maximum days allowed per request. NULL = no limit' })
  maxDaysPerRequest: number | null = null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean = true;
}
