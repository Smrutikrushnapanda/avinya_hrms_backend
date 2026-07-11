import { User } from 'src/modules/auth-core/entities/user.entity';
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

@Entity('wfh_app_summary')
@Unique(['user', 'appName', 'trackedDate'])
export class WfhAppSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'app_name', type: 'varchar', length: 255 })
  appName: string;

  @Column({ name: 'total_keystroke_count', type: 'int', default: 0 })
  totalKeystrokeCount: number;

  @Column({ name: 'total_mouse_clicks', type: 'int', default: 0 })
  totalMouseClicks: number;

  @Column({ name: 'total_duration_seconds', type: 'int', default: 0 })
  totalDurationSeconds: number;

  @Column({ name: 'tracked_date', type: 'date' })
  trackedDate: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
