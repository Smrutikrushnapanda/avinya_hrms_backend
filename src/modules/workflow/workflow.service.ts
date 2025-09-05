import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow } from './entities/workflow.entity';
import { WorkflowStep } from './entities/workflow-step.entity';
import { WorkflowAssignment } from './entities/workflow-assignment.entity';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,

    @InjectRepository(WorkflowStep)
    private stepRepo: Repository<WorkflowStep>,

    @InjectRepository(WorkflowAssignment)
    private assignmentRepo: Repository<WorkflowAssignment>,
  ) {}

  /** ---- Workflows ---- */
  async createWorkflow(dto: Partial<Workflow>): Promise<Workflow> {
    return this.workflowRepo.save(this.workflowRepo.create(dto));
  }

  async findAllWorkflows(): Promise<Workflow[]> {
    return this.workflowRepo.find({ relations: ['steps', 'steps.assignments'] });
  }

  async findWorkflowById(id: string): Promise<Workflow> {
    const wf = await this.workflowRepo.findOne({
      where: { id },
      relations: ['steps', 'steps.assignments'],
    });
    if (!wf) throw new NotFoundException(`Workflow ${id} not found`);
    return wf;
  }

  async updateWorkflow(id: string, dto: Partial<Workflow>): Promise<Workflow> {
    await this.workflowRepo.update(id, dto);
    return this.findWorkflowById(id);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.workflowRepo.delete(id);
  }

  /** ---- Steps ---- */
  async addStep(workflowId: string, dto: Partial<WorkflowStep>): Promise<WorkflowStep> {
    const step = this.stepRepo.create({ ...dto, workflowId });
    return this.stepRepo.save(step);
  }

  async updateStep(stepId: string, dto: Partial<WorkflowStep>): Promise<WorkflowStep> {
    await this.stepRepo.update(stepId, dto);
    return this.stepRepo.findOneOrFail({ where: { id: stepId }, relations: ['assignments'] });
  }

  async deleteStep(stepId: string): Promise<void> {
    await this.stepRepo.delete(stepId);
  }

  /** ---- Assignments ---- */
  async addAssignment(stepId: string, dto: Partial<WorkflowAssignment>): Promise<WorkflowAssignment> {
    const assignment = this.assignmentRepo.create({ ...dto, stepId });
    return this.assignmentRepo.save(assignment);
  }

  async updateAssignment(id: string, dto: Partial<WorkflowAssignment>): Promise<WorkflowAssignment> {
    await this.assignmentRepo.update(id, dto);
    return this.assignmentRepo.findOneOrFail({ where: { id } });
  }

  async deleteAssignment(id: string): Promise<void> {
    await this.assignmentRepo.delete(id);
  }
}
