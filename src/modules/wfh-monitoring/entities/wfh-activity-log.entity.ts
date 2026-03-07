import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wfh_activity_logs')
export class WfhActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'mouse_events', type: 'int', default: 0 })
  mouseEvents: number;

  @Column({ name: 'keyboard_events', type: 'int', default: 0 })
  keyboardEvents: number;

  @Column({ name: 'tab_switches', type: 'int', default: 0 })
  tabSwitches: number;

  @Column({ name: 'last_active_at', type: 'timestamp', nullable: true })
  lastActiveAt: Date | null;

  @Column({ name: 'is_lunch', type: 'boolean', default: false })
  isLunch: boolean;

  @Column({ name: 'lunch_start', type: 'timestamp', nullable: true })
  lunchStart: Date | null;

  @Column({ name: 'lunch_end', type: 'timestamp', nullable: true })
  lunchEnd: Date | null;

  @Column({ name: 'work_started_at', type: 'timestamp', nullable: true })
  workStartedAt: Date | null;

  @Column({ name: 'work_ended_at', type: 'timestamp', nullable: true })
  workEndedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
