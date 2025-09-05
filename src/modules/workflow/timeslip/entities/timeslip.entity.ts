import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { TimeslipApproval } from './timeslip-approval.entity';

@Entity('timeslips')
export class Timeslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'employee_id' }) // ✅ Fix here
  employee: Employee;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 10 })
  missing_type: 'IN' | 'OUT' | 'BOTH';

  @Column({ type: 'timestamp', nullable: true })
  corrected_in: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  corrected_out: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => TimeslipApproval, (approval) => approval.timeslip)
  approvals: TimeslipApproval[];
}
