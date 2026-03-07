import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { Organization } from 'src/modules/auth-core/entities/organization.entity';
import { User } from 'src/modules/auth-core/entities/user.entity';

export enum ResignationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'resignation_requests' })
export class ResignationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { nullable: false })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({ name: 'employee_user_id', type: 'uuid' })
  employeeUserId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'employee_user_id', referencedColumnName: 'id' })
  employeeUser: User;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'proposed_last_working_day', type: 'date', nullable: true })
  proposedLastWorkingDay: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: ResignationStatus.PENDING })
  status: ResignationStatus;

  @Column({ name: 'hr_remarks', type: 'text', nullable: true })
  hrRemarks: string | null;

  @Column({ name: 'approved_last_working_day', type: 'date', nullable: true })
  approvedLastWorkingDay: string | null;

  @Column({ name: 'allow_early_relieving', type: 'boolean', default: false })
  allowEarlyRelieving: boolean;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by_user_id', referencedColumnName: 'id' })
  reviewedByUser: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

