import {
  ProjectTask,
  TaskStatus,
} from '../clients/entities/project-task.entity';
import { ProjectsService } from '../clients/projects.service';
import { ProjectIssue } from '../project/entities/project-issue.entity';
import { ProjectService } from '../project/project.service';
import { UpdateProjectIssueDto } from '../project/dto/update-project-issue.dto';

function issueService() {
  const issue = {
    id: 'issue-1',
    projectId: 'project-1',
    organizationId: 'org-1',
    description: '- First\n- Second\n- Third',
    completedPointIndexes: [1],
    status: 'pending',
    progressPercent: 33,
  } as ProjectIssue;
  const issueRepo = {
    findOne: jest.fn().mockResolvedValue(issue),
    save: jest.fn((value: ProjectIssue) => Promise.resolve(value)),
  };
  const service = Object.create(ProjectService.prototype) as ProjectService;
  Object.assign(service, {
    issueRepo,
    ensureProjectAccess: jest.fn().mockResolvedValue(undefined),
  });
  const update = (dto: UpdateProjectIssueDto) =>
    service.updateIssue('project-1', 'issue-1', dto, 'user-1', 'org-1', true);
  return { issue, update };
}

function taskService() {
  const task = {
    id: 'task-1',
    assignedToUserId: 'user-1',
    status: TaskStatus.IN_PROGRESS,
    progressPercent: 33,
    completedPointIndexes: [1],
  } as ProjectTask;
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    save: jest.fn((value: ProjectTask) => Promise.resolve(value)),
  };
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  Object.assign(service, { taskRepo });
  const update = (status: TaskStatus) =>
    service.updateTaskStatus('task-1', 'user-1', status);
  return { task, update };
}

describe('direct project updates preserve accurate checklist identity', () => {
  it('clears saved point identity when an internal issue description changes', async () => {
    const { update } = issueService();
    const saved = await update({
      description: '- Second\n- First\n- New task',
    });
    expect(saved.completedPointIndexes).toEqual([]);
    expect(saved.description).toBe('- Second\n- First\n- New task');
    expect(saved.progressPercent).toBe(0);
    expect(saved.status).toBe('pending');
  });

  it.each([
    '- First\n- Second\n- Third\n- New task',
    '- Third\n- First\n- Second',
  ])(
    'reopens resolved work when steps change even if resolved status is echoed: %j',
    async (description) => {
      const { issue, update } = issueService();
      issue.status = 'resolved';
      issue.progressPercent = 100;
      issue.completedPointIndexes = [0, 1, 2];
      issue.resolvedAt = new Date();
      issue.resolvedByUserId = 'user-1';
      const saved = await update({ description, status: 'resolved' });
      expect(saved.completedPointIndexes).toEqual([]);
      expect(saved.progressPercent).toBe(0);
      expect(saved.status).toBe('pending');
      expect(saved.resolvedAt).toBeNull();
      expect(saved.resolvedByUserId).toBeNull();
    },
  );

  it('keeps saved checks when only introductory text changes', async () => {
    const { issue, update } = issueService();
    const saved = await update({
      description: `New overview\n${issue.description}`,
    });
    expect(saved.completedPointIndexes).toEqual([1]);
    expect(saved.progressPercent).toBe(33);
  });

  it('preserves completed paragraph work when paragraph wording changes', async () => {
    const { issue, update } = issueService();
    issue.description = 'Old paragraph';
    issue.status = 'resolved';
    issue.progressPercent = 100;
    issue.completedPointIndexes = null;
    const saved = await update({
      description: 'New paragraph',
      status: 'resolved',
    });
    expect(saved.completedPointIndexes).toBeNull();
    expect(saved.progressPercent).toBe(100);
    expect(saved.status).toBe('resolved');
  });

  it('retains checks when unchanged text/status are echoed while editing other fields', async () => {
    const { issue, update } = issueService();
    const saved = await update({
      description: ` ${issue.description} `,
      status: 'pending',
      issueTitle: 'Renamed',
    });
    expect(saved.completedPointIndexes).toEqual([1]);
    expect(saved.progressPercent).toBe(33);
  });

  it('clears point identity and synchronizes percentages for direct issue completion and reopening', async () => {
    const { issue, update } = issueService();
    expect((await update({ status: 'resolved' })).progressPercent).toBe(100);
    expect(issue.completedPointIndexes).toBeNull();
    issue.completedPointIndexes = [0, 1, 2];
    const reopened = await update({ status: 'pending' });
    expect(reopened.completedPointIndexes).toBeNull();
    expect(reopened.progressPercent).toBe(0);
    expect(reopened.resolvedAt).toBeNull();
  });

  it('retains checks when unchanged client task status is echoed', async () => {
    const { update } = taskService();
    const saved = await update(TaskStatus.IN_PROGRESS);
    expect(saved.completedPointIndexes).toEqual([1]);
    expect(saved.progressPercent).toBe(33);
  });

  it('clears point identity and synchronizes percentages for direct client task completion and reopening', async () => {
    const { task, update } = taskService();
    expect((await update(TaskStatus.COMPLETED)).progressPercent).toBe(100);
    expect(task.completedPointIndexes).toBeNull();
    task.completedPointIndexes = [0, 1, 2];
    const reopened = await update(TaskStatus.PENDING);
    expect(reopened.completedPointIndexes).toBeNull();
    expect(reopened.progressPercent).toBe(0);
    expect(reopened.completedAt).toBeNull();
  });
});
