import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { LeaveRequest } from "./leave-request.entity";
import { User } from "src/modules/auth-core/entities/user.entity";

@Entity('leave_approvals')
@Unique(['leaveRequest', 'level'])
export class LeaveApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LeaveRequest, request => request.approvals)
  @JoinColumn({ name: 'leave_request_id' })
  leaveRequest: LeaveRequest;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'approver_id' })
  approver: User;

  @Column({ default: 'WAITING' })
  status: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ type: 'int' })
  level: number;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @Column({ type: 'timestamp', nullable: true })
  actionAt: Date;
}