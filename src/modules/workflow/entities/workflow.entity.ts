import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { WorkflowStep } from './workflow-step.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { Department } from 'src/modules/employee/entities/department.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string; // e.g. Leave Approval, Timesheet Approval

  @Column({ name: 'type', type: 'varchar', length: 50 })
  type: string; // LEAVE, TIMESLIP, EXPENSE, GENERIC

  /** ---- Scope bindings ---- */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** ---- Steps in workflow ---- */
  @OneToMany(() => WorkflowStep, (step) => step.workflow, { cascade: true })
  steps: WorkflowStep[];
}
