import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_activities')
export class UserActivity {
  @PrimaryGeneratedColumn('uuid', { name: 'activity_id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid'})
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;

  @Column({ name: 'activity_type', type: 'varchar', length: 50 })
  activityType: string;

  @Column({ name: 'activity_description', type: 'text', nullable: true })
  activityDescription?: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'module', type: 'varchar', length: 100, nullable: true })
  module?: string;

  @Column({ name: 'action_taken', type: 'varchar', length: 100, nullable: true })
  actionTaken?: string;

  @Column({ name: 'performed_by', type: 'varchar', length: 100, nullable: true })
  performedBy?: string;

  @Column({ name: 'is_success', type: 'boolean', default: true })
  isSuccess: boolean;

  @Column({ name: 'error_details', type: 'text', nullable: true })
  errorDetails?: string;
}