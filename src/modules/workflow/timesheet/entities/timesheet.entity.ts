import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';

export enum TimesheetWorkStatus {
  COMPLETED = 'COMPLETED',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
}

export enum TimesheetApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('timesheets')
export class Timesheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime: Date;

  @Column({ name: 'working_minutes', type: 'int' })
  workingMinutes: number;

  @Column({
    name: 'project_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  projectName: string | null;

  @Column({ name: 'client_name', type: 'varchar', length: 150, nullable: true })
  clientName: string | null;

  @Column({
    name: 'module_feature',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  moduleFeature: string | null;

  @Column({
    name: 'page_screen',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  pageScreen: string | null;

  @Column({ name: 'work_description', type: 'text' })
  workDescription: string;

  @Column({
    name: 'work_status',
    type: 'enum',
    enum: TimesheetWorkStatus,
    default: TimesheetWorkStatus.COMPLETED,
  })
  workStatus: TimesheetWorkStatus;

  @Column({ name: 'employee_remark', type: 'text', nullable: true })
  employeeRemark: string | null;

  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: TimesheetApprovalStatus,
    default: TimesheetApprovalStatus.PENDING,
  })
  approvalStatus: TimesheetApprovalStatus;

  @Column({ name: 'manager_remark', type: 'text', nullable: true })
  managerRemark: string | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: Employee;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
