import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Meeting } from '../../meeting/entities/meeting.entity';

@Entity('notices')
export class Notice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({ nullable: true })
  bg_image_url?: string;

  @Column({ type: 'varchar', length: 50, default: 'info' })
  type: string;

  /** Which roles this notice is visible to within its organization. */
  @Column({
    name: 'target_roles',
    type: 'jsonb',
    default: ['ADMIN', 'HR', 'EMPLOYEE'],
  })
  targetRoles: string[];

  @Column({ type: 'timestamptz' })
  start_at: Date;

  @Column({ type: 'timestamptz' })
  end_at: Date;

  @ManyToOne(() => Meeting, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: Meeting;

  @Column({ name: 'meeting_id', nullable: true })
  meetingId?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
