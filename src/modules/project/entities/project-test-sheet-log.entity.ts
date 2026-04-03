import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ProjectTestSheetSource } from './project-test-sheet-tab.entity';

@Entity('project_test_sheet_change_logs')
@Index('idx_project_test_sheet_logs_scope', ['organizationId', 'projectSource', 'projectId'])
export class ProjectTestSheetChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'project_source', type: 'varchar', length: 20, default: 'standalone' })
  projectSource: ProjectTestSheetSource;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'tab_id', type: 'uuid', nullable: true })
  tabId: string | null;

  @Column({ name: 'test_case_id', type: 'uuid', nullable: true })
  testCaseId: string | null;

  @Column({ name: 'action', type: 'varchar', length: 60 })
  action: string;

  @Column({ name: 'field_name', type: 'varchar', length: 80, nullable: true })
  fieldName: string | null;

  @Column({ name: 'summary', type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'before_value', type: 'jsonb', nullable: true })
  beforeValue: Record<string, unknown> | null;

  @Column({ name: 'after_value', type: 'jsonb', nullable: true })
  afterValue: Record<string, unknown> | null;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId: string | null;

  @Column({ name: 'changed_by_user_name', type: 'varchar', length: 150, nullable: true })
  changedByUserName: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
