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

  @Column({ name: 'project_name', type: 'varchar', length: 150, nullable: true })
  projectName: string | null;

  @Column({ name: 'client_name', type: 'varchar', length: 150, nullable: true })
  clientName: string | null;

  @Column({ name: 'work_description', type: 'text' })
  workDescription: string;

  @Column({ name: 'employee_remark', type: 'text', nullable: true })
  employeeRemark: string | null;

  @Column({ name: 'manager_remark', type: 'text', nullable: true })
  managerRemark: string | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: Employee;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
