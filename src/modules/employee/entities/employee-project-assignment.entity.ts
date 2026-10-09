import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Employee } from './employee.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';

export type EmployeeProjectSource = 'internal' | 'client';

@Entity('employee_project_assignments')
@Index(['organizationId', 'employeeId', 'projectId', 'projectSource'], {
  unique: true,
})
export class EmployeeProjectAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'project_source', length: 20, default: 'internal' })
  projectSource: EmployeeProjectSource;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @Column({ name: 'manager_type', length: 20, default: 'SECONDARY' })
  managerType: string; // 'PRIMARY' | 'SECONDARY'

  @Column({ name: 'role', length: 50, default: 'member' })
  role: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'manager_id' })
  manager: Employee | null;

  // projectId is polymorphic: projectSource decides whether it points to
  // projects.id or client_projects.id. Do not add a TypeORM relation here.
}
