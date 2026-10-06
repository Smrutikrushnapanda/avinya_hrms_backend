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
import { Employee } from './employee.entity';
import { ResignationRequest } from 'src/modules/resignation/entities/resignation-request.entity';

export enum SettlementStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  FINALIZED = 'FINALIZED',
  APPROVED = 'APPROVED',
  PROCESSED = 'PROCESSED',
  LOCKED = 'LOCKED',
}

@Entity('employee_settlements')
@Index(['organizationId', 'employeeId'])
export class EmployeeSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'resignation_request_id', type: 'uuid', nullable: true })
  resignationRequestId: string | null;

  @Column({ name: 'resignation_date', type: 'date', nullable: true })
  resignationDate: string | null;

  @Column({ name: 'notice_period_days', type: 'int', default: 0 })
  noticePeriodDays: number;

  @Column({ name: 'last_working_date', type: 'date', nullable: true })
  lastWorkingDate: string | null;

  @Column({ name: 'reason_for_leaving', type: 'text', nullable: true })
  reasonForLeaving: string | null;

  // Earnings
  @Column({
    name: 'salary_due',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  salaryDue: number;

  @Column({
    name: 'pending_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  pendingSalary: number;

  @Column({
    name: 'leave_encashment_days',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  leaveEncashmentDays: number;

  @Column({
    name: 'leave_encashment_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  leaveEncashmentAmount: number;

  @Column({
    name: 'bonus_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  bonusAmount: number;

  @Column({
    name: 'incentive_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  incentiveAmount: number;

  @Column({
    name: 'other_payable_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  otherPayableAmount: number;

  @Column({
    name: 'total_earnings',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalEarnings: number;

  // Deductions
  @Column({
    name: 'notice_period_recovery_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  noticePeriodRecoveryAmount: number;

  @Column({
    name: 'loan_recovery_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  loanRecoveryAmount: number;

  @Column({
    name: 'asset_deduction_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  assetDeductionAmount: number;

  @Column({
    name: 'other_deductions_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  otherDeductionsAmount: number;

  @Column({ name: 'deductions_remarks', type: 'text', nullable: true })
  deductionsRemarks: string | null;

  @Column({
    name: 'total_deductions',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalDeductions: number;

  // Net Final Settlement
  @Column({
    name: 'final_settlement_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  finalSettlementAmount: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: SettlementStatus.DRAFT,
  })
  status: SettlementStatus;

  @Column({ name: 'prepared_by', length: 150, nullable: true })
  preparedBy: string | null;

  @Column({ name: 'hr_approval_name', length: 150, nullable: true })
  hrApprovalName: string | null;

  @Column({ name: 'finance_approval_name', length: 150, nullable: true })
  financeApprovalName: string | null;

  @Column({ name: 'approval_date', type: 'date', nullable: true })
  approvalDate: string | null;

  @Column({
    name: 'employee_declaration_acknowledged',
    type: 'boolean',
    default: true,
  })
  employeeDeclarationAcknowledged: boolean;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

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

  @ManyToOne(() => ResignationRequest, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resignation_request_id' })
  resignationRequest: ResignationRequest | null;
}
