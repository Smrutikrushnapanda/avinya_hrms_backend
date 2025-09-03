import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Timeslip } from './timeslip.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Entity('timeslip_approvals')
export class TimeslipApproval {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'timeslip_id', type: 'uuid', nullable: true })
  timeslip_id: string | null;

  @ManyToOne(() => Timeslip, (timeslip) => timeslip.approvals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timeslip_id' })
  timeslip: Timeslip;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approver_id: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'approver_id' })
  approver: Employee | null;

  @Column({ name: 'action', type: 'varchar', length: 20, default: 'PENDING' })
  action: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'acted_at', type: 'timestamp', nullable: true })
  acted_at: Date | null;
}