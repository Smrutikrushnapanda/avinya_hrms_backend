import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProjectTestSheetSource = 'standalone' | 'client';

@Entity('project_test_sheet_tabs')
@Index('idx_project_test_sheet_tabs_scope', ['organizationId', 'projectSource', 'projectId'])
export class ProjectTestSheetTab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'project_source', type: 'varchar', length: 20, default: 'standalone' })
  projectSource: ProjectTestSheetSource;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
