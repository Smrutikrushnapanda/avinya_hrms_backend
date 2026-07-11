import { User } from 'src/modules/auth-core/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('wfh_app_activity')
@Index(['user', 'date'])
export class WfhAppActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'app_name', type: 'varchar', length: 255 })
  appName: string;

  @Column({
    name: 'window_title',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  windowTitle: string | null;

  @Column({ name: 'keystroke_count', type: 'int', default: 0 })
  keystrokeCount: number;

  @Column({ name: 'mouse_clicks', type: 'int', default: 0 })
  mouseClicks: number;

  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds: number;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'occurred_at', type: 'timestamp' })
  occurredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
