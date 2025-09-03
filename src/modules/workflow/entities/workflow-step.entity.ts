import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Workflow } from './workflow.entity';
import { WorkflowAssignment } from './workflow-assignment.entity';

@Entity('workflow_steps')
export class WorkflowStep {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'workflow_id' })
  workflowId: string;

  @ManyToOne(() => Workflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: Workflow;

  @Column({ name: 'step_order' })
  stepOrder: number; // sequence of approval, e.g. 1, 2, 3

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string; // e.g. Manager Approval, HR Approval

  @Column({ name: 'condition', type: 'varchar', length: 50, nullable: true })
  condition?: string; // optional: condition like amount > 50k

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string; // ACTIVE | INACTIVE

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => WorkflowAssignment, (assignment) => assignment.step, {
    cascade: true,
  })
  assignments: WorkflowAssignment[];
}
