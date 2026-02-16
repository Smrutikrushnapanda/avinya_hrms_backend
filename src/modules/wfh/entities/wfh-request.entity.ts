import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WfhApproval } from './wfh-approval.entity';

@Entity('wfh_requests')
export class WfhRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string;

  @Column({ name: 'number_of_days', type: 'float', default: 1 })
  numberOfDays: number;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'status', default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy: User;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => WfhApproval, (approval) => approval.wfhRequest, {
    cascade: true,
  })
  approvals: WfhApproval[];
}
