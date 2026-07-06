import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Entity('employee_bank_details')
export class EmployeeBankDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'employee_id', type: 'uuid', unique: true })
  employeeId: string;

  @Column({ name: 'account_holder_name', length: 150 })
  accountHolderName: string;

  @Column({ name: 'bank_name', length: 150 })
  bankName: string;

  @Column({ name: 'account_number', length: 34 })
  accountNumber: string;

  @Column({ name: 'ifsc_code', length: 11 })
  ifscCode: string;

  @Column({ name: 'branch_name', length: 150, nullable: true })
  branchName: string;

  @Column({ name: 'pan_number', length: 10, nullable: true })
  panNumber: string;

  @Column({ name: 'uan_number', length: 20, nullable: true })
  uanNumber: string;

  @Column({ name: 'pf_number', length: 30, nullable: true })
  pfNumber: string;

  @Column({ name: 'esi_number', length: 20, nullable: true })
  esiNumber: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
