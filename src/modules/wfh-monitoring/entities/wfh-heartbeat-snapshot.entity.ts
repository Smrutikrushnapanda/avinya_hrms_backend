import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('wfh_heartbeat_snapshots')
export class WfhHeartbeatSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'mouse_events', type: 'int', default: 0 })
  mouseEvents: number;

  @Column({ name: 'keyboard_events', type: 'int', default: 0 })
  keyboardEvents: number;

  @Column({ name: 'tab_switches', type: 'int', default: 0 })
  tabSwitches: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
