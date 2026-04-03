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
import { ProjectMember } from './project-member.entity';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable for legacy rows; enforce at service level for new inserts
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string;

  // Default empty string so legacy rows pass NOT NULL when column is added
  @Column({ name: 'name', default: '' })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'status', default: 'planning' })
  status: ProjectStatus;

  @Column({ name: 'priority', default: 'medium' })
  priority: ProjectPriority;

  @Column({ name: 'completion_percent', type: 'int', default: 0 })
  completionPercent: number;

  @Column({ name: 'estimated_end_date', type: 'date', nullable: true })
  estimatedEndDate: string | null;

  @Column({ name: 'project_cost', type: 'decimal', precision: 12, scale: 2, nullable: true })
  projectCost: number | null;

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate: number | null;

  @Column({ name: 'test_sheet_column_headers', type: 'jsonb', nullable: true })
  testSheetColumnHeaders: Record<string, string> | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: User;

  // Allow null for legacy rows; new inserts should set creator explicitly
  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string;

  @OneToMany(() => ProjectMember, (pm) => pm.project, { cascade: true })
  members: ProjectMember[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
