import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WfhRequest } from './wfh-request.entity';
import { User } from 'src/modules/auth-core/entities/user.entity';

@Entity('wfh_approvals')
@Unique(['wfhRequest', 'level'])
export class WfhApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => WfhRequest, (request) => request.approvals)
  @JoinColumn({ name: 'wfh_request_id' })
  wfhRequest: WfhRequest;

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
