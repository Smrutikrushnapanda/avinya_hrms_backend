import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { WorkflowStep } from './workflow-step.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { Role } from 'src/modules/auth-core/entities/role.entity';

@Entity('workflow_assignments')
export class WorkflowAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ---- Step Reference ---- */
  @Column({ type: 'uuid', name: 'step_id' })
  stepId: string;

  @ManyToOne(() => WorkflowStep, (step) => step.assignments, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'step_id' })
  step: WorkflowStep;

  /** ---- Target Employee ---- */
  @ManyToOne(() => Employee, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId: string; // The employee for whom this workflow applies

  /** ---- Approver mapping ---- */
  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_id' })
  approver: Employee;

  @Column({ type: 'uuid', name: 'approver_id', nullable: true })
  approverId: string | null; // Specific approver employee

  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ type: 'uuid', name: 'role_id', nullable: true })
  roleId: string | null; // Role-based approval fallback

  /** ---- Fallback & Priority ---- */
  @Column({ type: 'boolean', name: 'is_fallback', default: false })
  isFallback: boolean;

  @Column({ type: 'int', name: 'priority_order', default: 1 })
  priorityOrder: number;

  /** ---- Audit ---- */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}