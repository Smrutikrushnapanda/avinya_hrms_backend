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

export enum AssetStatus {
  ASSIGNED = 'ASSIGNED',
  RETURN_PENDING = 'RETURN_PENDING',
  RETURNED = 'RETURNED',
  LOST = 'LOST',
  DAMAGED = 'DAMAGED',
}

@Entity('employee_assets')
@Index(['organizationId', 'employeeId'])
export class EmployeeAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'asset_type', length: 50 })
  assetType: string;

  @Column({ name: 'asset_name', length: 150 })
  assetName: string;

  @Column({ name: 'asset_id', length: 100 })
  assetId: string;

  @Column({ name: 'serial_number', length: 100, nullable: true })
  serialNumber: string | null;

  @Column({ name: 'brand', length: 100, nullable: true })
  brand: string | null;

  @Column({ name: 'model', length: 100, nullable: true })
  model: string | null;

  @Column({ name: 'condition', length: 50, default: 'Good' })
  condition: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate: string;

  @Column({ name: 'expected_return_date', type: 'date', nullable: true })
  expectedReturnDate: string | null;

  @Column({ name: 'actual_return_date', type: 'date', nullable: true })
  actualReturnDate: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: AssetStatus.ASSIGNED,
  })
  status: AssetStatus;

  @Column({ name: 'is_return_required', type: 'boolean', default: true })
  isReturnRequired: boolean;

  @Column({ name: 'acknowledged', type: 'boolean', default: false })
  acknowledged: boolean;

  @Column({
    name: 'acknowledged_at',
    type: 'timestamptz',
    nullable: true,
  })
  acknowledgedAt: Date | null;

  @Column({ name: 'acknowledged_by_user_id', type: 'uuid', nullable: true })
  acknowledgedByUserId: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

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
