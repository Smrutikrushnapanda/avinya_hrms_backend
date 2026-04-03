import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProjectTestSheetSource } from './project-test-sheet-tab.entity';

export type ProjectTestCaseStatus = 'pending' | 'resolved';

@Entity('project_test_sheet_cases')
@Index('idx_project_test_sheet_cases_scope', ['organizationId', 'projectSource', 'projectId'])
@Index('idx_project_test_sheet_cases_tab', ['tabId', 'rowIndex'])
export class ProjectTestSheetCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'project_source', type: 'varchar', length: 20, default: 'standalone' })
  projectSource: ProjectTestSheetSource;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'tab_id', type: 'uuid' })
  tabId: string;

  @Column({ name: 'row_index', type: 'integer', default: 0 })
  rowIndex: number;

  @Column({ name: 'case_code', type: 'varchar', length: 80, nullable: true })
  caseCode: string | null;

  @Column({ name: 'title', type: 'varchar', length: 250 })
  title: string;

  @Column({ name: 'steps', type: 'text', nullable: true })
  steps: string | null;

  @Column({ name: 'expected_result', type: 'text', nullable: true })
  expectedResult: string | null;

  @Column({ name: 'actual_result', type: 'text', nullable: true })
  actualResult: string | null;

  @Column({ name: 'qa_user_id', type: 'uuid', nullable: true })
  qaUserId: string | null;

  @Column({ name: 'developer_user_id', type: 'uuid', nullable: true })
  developerUserId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'pending' })
  status: ProjectTestCaseStatus;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
