import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';

@Entity('client_projects')
export class ClientProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Allow null for legacy rows so sync can succeed; new rows should always set this
  @Column({ name: 'organization_id', nullable: true })
  organizationId: string;

  @Column({ name: 'client_id', nullable: true })
  clientId: string;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: Employee | null;

  // Default empty string lets TypeORM add the column on existing rows without failing on NOT NULL
  @Column({ name: 'project_name', length: 150, default: '' })
  projectName: string;

  @Column({ name: 'project_code', length: 50, nullable: true })
  projectCode: string;

  @Column({ name: 'status', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'completion_percent', type: 'int', default: 0 })
  completionPercent: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
