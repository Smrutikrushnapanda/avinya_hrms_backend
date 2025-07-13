import { User } from "src/modules/auth-core/entities/user.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { LeaveType } from "./leave-type.entity";

@Entity('leave_balances')
@Unique(['user', 'leaveType'])
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => LeaveType)
  @JoinColumn({ name: 'leave_type_id' })
  leaveType: LeaveType;

  @Column({ type: 'int', default: 0 })
  openingBalance: number;

  @Column({ type: 'int', default: 0 })
  accrued: number;

  @Column({ type: 'int', default: 0 })
  consumed: number;

  @Column({ type: 'int', default: 0 })
  carriedForward: number;

  @Column({ type: 'int', default: 0 })
  encashed: number;

  @Column({ type: 'int', default: 0 })
  closingBalance: number;
}
