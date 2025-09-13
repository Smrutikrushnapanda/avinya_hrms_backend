import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { Workflow } from './entities/workflow.entity';
import { WorkflowStep } from './entities/workflow-step.entity';
import { WorkflowAssignment } from './entities/workflow-assignment.entity';
import { ApiBadRequestResponse, ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /** ---- Workflows ---- */
  @Post()
  createWorkflow(@Body() dto: Partial<Workflow>) {
    return this.workflowService.createWorkflow(dto);
  }

  @Get()
  findAllWorkflows() {
    return this.workflowService.findAllWorkflows();
  }

  @Get(':id')
  findWorkflowById(@Param('id') id: string) {
    return this.workflowService.findWorkflowById(id);
  }

  @Put(':id')
  updateWorkflow(@Param('id') id: string, @Body() dto: Partial<Workflow>) {
    return this.workflowService.updateWorkflow(id, dto);
  }

  @Delete(':id')
  deleteWorkflow(@Param('id') id: string) {
    return this.workflowService.deleteWorkflow(id);
  }

  /** ---- Steps ---- */
  @Post(':workflowId/steps')
  addStep(@Param('workflowId') workflowId: string, @Body() dto: Partial<WorkflowStep>) {
    return this.workflowService.addStep(workflowId, dto);
  }

  @Put('steps/:stepId')
  updateStep(@Param('stepId') stepId: string, @Body() dto: Partial<WorkflowStep>) {
    return this.workflowService.updateStep(stepId, dto);
  }

  @Delete('steps/:stepId')
  deleteStep(@Param('stepId') stepId: string) {
    return this.workflowService.deleteStep(stepId);
  }

  /** ---- Assignments ---- */
  @Post('steps/:stepId/assignments')
  addAssignment(@Param('stepId') stepId: string, @Body() dto: Partial<WorkflowAssignment>) {
    return this.workflowService.addAssignment(stepId, dto);
  }

  @Put('assignments/:id')
  updateAssignment(@Param('id') id: string, @Body() dto: Partial<WorkflowAssignment>) {
    return this.workflowService.updateAssignment(id, dto);
  }

  @Delete('assignments/:id')
  deleteAssignment(@Param('id') id: string) {
    return this.workflowService.deleteAssignment(id);
  }

//New
@Put('steps/:stepId/approver')
@ApiOperation({ 
  summary: 'Update approver for workflow step',
  description: 'Replace the current approver with a new one'
})
@ApiParam({ name: 'stepId', description: 'Workflow Step ID (UUID)' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      approverId: { type: 'string', format: 'uuid' }
    },
    required: ['approverId']
  }
})
async updateStepApprover(
  @Param('stepId') stepId: string,
  @Body() body: { approverId: string }
) {
  return this.workflowService.updateStepApprover(stepId, body.approverId);
}


}