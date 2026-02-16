import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity';

@Entity('payroll_notifications')
export class PayrollNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'payroll_record_id' })
  payrollRecordId: string;

  @Column({ length: 255 })
  title: string;

  @Column('text')
  message: string;

  @Column({ name: 'sent_via', length: 50 })
  sentVia: string; // 'email' | 'in_app' | 'both'

  @Column({ name: 'email_sent', default: false })
  emailSent: boolean;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
