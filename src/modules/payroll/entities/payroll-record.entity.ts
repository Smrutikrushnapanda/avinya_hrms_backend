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

export type PayrollStatus = 'draft' | 'processed' | 'paid';

@Entity('payroll_records')
export class PayrollRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'pay_period', type: 'varchar', length: 7 })
  payPeriod: string; // YYYY-MM

  @Column({ name: 'period_start', type: 'date' })
  periodStart: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: Date;

  @Column({ name: 'basic', type: 'numeric' })
  basic: number;

  @Column({ name: 'hra', type: 'numeric' })
  hra: number;

  @Column({ name: 'conveyance', type: 'numeric' })
  conveyance: number;

  @Column({ name: 'other_allowances', type: 'numeric' })
  otherAllowances: number;

  @Column({ name: 'pf', type: 'numeric' })
  pf: number;

  @Column({ name: 'tds', type: 'numeric' })
  tds: number;

  @Column({ name: 'total_earnings', type: 'numeric' })
  totalEarnings: number;

  @Column({ name: 'total_deductions', type: 'numeric' })
  totalDeductions: number;

  @Column({ name: 'net_pay', type: 'numeric' })
  netPay: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: PayrollStatus;

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
