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
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Entity('salary_structures')
export class SalaryStructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'name', type: 'varchar', length: 150, nullable: true })
  name: string;

  // Earnings
  @Column({ name: 'basic', type: 'numeric', default: 0 })
  basic: number;

  @Column({ name: 'hra', type: 'numeric', default: 0 })
  hra: number;

  @Column({ name: 'conveyance', type: 'numeric', default: 0 })
  conveyance: number;

  @Column({ name: 'other_allowances', type: 'numeric', default: 0 })
  otherAllowances: number;

  // Deductions
  @Column({ name: 'pf', type: 'numeric', default: 0 })
  pf: number;

  @Column({ name: 'tds', type: 'numeric', default: 0 })
  tds: number;

  // Computed totals
  @Column({ name: 'gross_salary', type: 'numeric', default: 0 })
  grossSalary: number;

  @Column({ name: 'total_deductions', type: 'numeric', default: 0 })
  totalDeductions: number;

  @Column({ name: 'net_salary', type: 'numeric', default: 0 })
  netSalary: number;

  // Effective dates for salary revisions
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status: string; // 'active' | 'inactive'

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
