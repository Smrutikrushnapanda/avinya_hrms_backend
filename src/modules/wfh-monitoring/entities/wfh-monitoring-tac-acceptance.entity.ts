import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('wfh_monitoring_tac_acceptances')
@Unique(['user'])
export class WfhMonitoringTacAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'accepted_at', type: 'timestamp' })
  acceptedAt: Date;

  @Column({ name: 'tac_version', type: 'varchar', length: 20, default: '1.0' })
  tacVersion: string;
}
