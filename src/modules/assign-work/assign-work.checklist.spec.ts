import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import {
  ProjectTask,
  TaskStatus,
} from '../clients/entities/project-task.entity';
import { ProjectIssue } from '../project/entities/project-issue.entity';
import { AssignWorkService } from './assign-work.service';
import {
  CreateAssignWorkDto,
  UpdateWorkProgressDto,
  WorkSource,
} from './dto/create-assign-work.dto';

const ORGANIZATION_ID = 'org-1';
const ASSIGNER_ID = 'assigner-1';
const ASSIGNEE_ID = 'assignee-1';
const DESCRIPTION = '- [ ] First task\n2. Second task\n• Third task';
const user = { userId: ASSIGNEE_ID, roles: [] } as JwtPayload;

function makeService(source: WorkSource = WorkSource.CLIENT) {
  const now = new Date('2026-10-23T00:00:00.000Z');
  const task = {
    id: 'task-1',
    title: 'Work',
    description: DESCRIPTION,
    organizationId: ORGANIZATION_ID,
    assignedByUserId: ASSIGNER_ID,
    assignedToUserId: ASSIGNEE_ID,
    status: TaskStatus.PENDING,
    progressPercent: 0,
    completedPointIndexes: [],
    completedAt: null,
    createdAt: now,
  } as ProjectTask;
  const issue = {
    id: 'issue-1',
    issueTitle: 'Work',
    description: DESCRIPTION,
    organizationId: ORGANIZATION_ID,
    createdByUserId: ASSIGNER_ID,
    assigneeUserId: ASSIGNEE_ID,
    status: 'pending',
    progressPercent: 0,
    completedPointIndexes: [],
    resolvedAt: null,
    createdAt: now,
  } as ProjectIssue;
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    create: jest.fn((input: Partial<ProjectTask>) => input),
    save: jest.fn((input: ProjectTask) => Promise.resolve(input)),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([task]),
    }),
  };
  const issueRepo = {
    findOne: jest.fn().mockResolvedValue(issue),
    find: jest.fn().mockResolvedValue([issue]),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([issue]),
    }),
    create: jest.fn((input: Partial<ProjectIssue>) => input),
    save: jest.fn((input: ProjectIssue) => Promise.resolve(input)),
  };
  const clientProjectRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({
      id: 'project-1',
      projectName: 'Client',
      organizationId: ORGANIZATION_ID,
    }),
  };
  const internalProjectRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({
      id: 'project-1',
      name: 'Internal',
      organizationId: ORGANIZATION_ID,
    }),
  };
  const employeeRepo = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 'employee-1', userId: ASSIGNEE_ID }]),
  };
  const messageService = {
    createMessage: jest
      .fn()
      .mockResolvedValue({ recipientUserIds: [], message: {} }),
  };
  const service = new AssignWorkService(
    taskRepo as never,
    clientProjectRepo as never,
    issueRepo as never,
    internalProjectRepo as never,
    employeeRepo as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    messageService as never,
    { emitToUsers: jest.fn() } as never,
    {} as never,
  );
  const item = source === WorkSource.INTERNAL ? issue : task;
  const save = source === WorkSource.INTERNAL ? issueRepo.save : taskRepo.save;
  const update = (dto: UpdateWorkProgressDto) =>
    service.updateProgress(user, ORGANIZATION_ID, item.id, { ...dto, source });

  return {
    service,
    item,
    task,
    issue,
    taskRepo,
    issueRepo,
    save,
    update,
    messageService,
    employeeRepo,
  };
}

describe('assign work DTO validation', () => {
  it.each([undefined, null, '', ' \n '])(
    'requires description: %j',
    (description) => {
      const dto = Object.assign(new CreateAssignWorkDto(), {
        title: 'Work',
        description,
      });
      expect(
        validateSync(dto).some((error) => error.property === 'description'),
      ).toBe(true);
    },
  );

  it.each([[-1], [0.5], [0, 0], ['0'], '0'].map((indexes) => ({ indexes })))(
    'rejects invalid point indexes: %j',
    ({ indexes }) => {
      const dto = Object.assign(new UpdateWorkProgressDto(), {
        completedPointIndexes: indexes,
      });
      expect(
        validateSync(dto).some(
          (error) => error.property === 'completedPointIndexes',
        ),
      ).toBe(true);
    },
  );

  it('accepts empty or nonsequential unique point indexes', () => {
    for (const completedPointIndexes of [[], [0, 2]]) {
      expect(
        validateSync(
          Object.assign(new UpdateWorkProgressDto(), { completedPointIndexes }),
        ),
      ).toHaveLength(0);
    }
  });
});

describe('AssignWorkService checklist creation', () => {
  it.each(['', ' \n ', '- [ ]\n1.'])(
    'rejects empty description before any writes: %j',
    async (description) => {
      const { service, taskRepo, issueRepo, employeeRepo } = makeService();
      await expect(
        service.create(ASSIGNER_ID, ORGANIZATION_ID, {
          title: 'Work',
          description,
          assignedToUserIds: [ASSIGNEE_ID],
        }),
      ).rejects.toThrow('Description is required');
      expect(employeeRepo.find).not.toHaveBeenCalled();
      expect(taskRepo.save).not.toHaveBeenCalled();
      expect(issueRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each([WorkSource.CLIENT, WorkSource.INTERNAL])(
    'seeds independent unchecked points for %s, ignoring authored checked markers',
    async (source) => {
      const { service, taskRepo, issueRepo } = makeService(source);
      const created = await service.create(ASSIGNER_ID, ORGANIZATION_ID, {
        title: 'Work',
        description: '- [x] First\n- [ ] Second',
        assignedToUserIds: [ASSIGNEE_ID],
        projectId: 'project-1',
        source,
      });
      expect(created[0].completedPointIndexes).toEqual([]);
      expect(created[0].description).toBe('- [x] First\n- [ ] Second');
      expect(
        source === WorkSource.CLIENT ? taskRepo.save : issueRepo.save,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps paragraph assignments on manual progress', async () => {
    const { service } = makeService();
    const created = await service.create(ASSIGNER_ID, ORGANIZATION_ID, {
      title: 'Work',
      description: 'Paragraph work',
      assignedToUserIds: [ASSIGNEE_ID],
    });
    expect(created[0].completedPointIndexes).toBeNull();
  });

  it('preserves code syntax and literal entities when creating descriptions', async () => {
    const { service } = makeService();
    const description =
      '- Add <Select> component\n- Check x < 10\n- Check y > 0\n- Render &nbsp;';
    const created = await service.create(ASSIGNER_ID, ORGANIZATION_ID, {
      title: 'Code tasks',
      description,
      assignedToUserIds: [ASSIGNEE_ID],
    });
    expect(created[0].description).toBe(description);
    expect(created[0].completedPointIndexes).toEqual([]);
  });
});

describe.each([WorkSource.CLIENT, WorkSource.INTERNAL])(
  'AssignWorkService %s checklist progress',
  (source) => {
    it.each([200, 1000])(
      'keeps %i-point lists below100 until every point is complete',
      async (total) => {
        const { item, update, messageService } = makeService(source);
        item.description = Array.from(
          { length: total },
          (_, index) => `- Point ${index + 1}`,
        ).join('\n');
        const almostAll = Array.from(
          { length: total - 1 },
          (_, index) => index,
        );
        const partial = await update({ completedPointIndexes: almostAll });
        expect(partial.progressPercent).toBe(99);
        expect(partial.status).toBe(
          source === WorkSource.CLIENT ? 'in_progress' : 'pending',
        );
        expect(partial.completedAt).toBeNull();
        expect(messageService.createMessage).not.toHaveBeenCalled();
        const complete = await update({
          completedPointIndexes: [...almostAll, total - 1],
        });
        expect(complete.progressPercent).toBe(100);
        expect(complete.status).toBe(
          source === WorkSource.CLIENT ? 'completed' : 'resolved',
        );
        expect(messageService.createMessage).toHaveBeenCalledTimes(1);
      },
    );

    it('persists nonsequential checks, computes percent, completes once, and reopens on uncheck', async () => {
      const { item, update, messageService } = makeService(source);
      const partial = await update({
        completedPointIndexes: [2, 0],
        progressPercent: 100,
        status: 'completed',
      });
      expect(partial.completedPointIndexes).toEqual([0, 2]);
      expect(partial.progressPercent).toBe(67);
      expect(partial.status).toBe(
        source === WorkSource.CLIENT ? 'in_progress' : 'pending',
      );
      expect(partial.completedAt).toBeNull();
      expect(messageService.createMessage).not.toHaveBeenCalled();

      const complete = await update({ completedPointIndexes: [2, 0, 1] });
      expect(complete.progressPercent).toBe(100);
      expect(complete.status).toBe(
        source === WorkSource.CLIENT ? 'completed' : 'resolved',
      );
      expect(complete.completedAt).toBeInstanceOf(Date);
      const completedAt = complete.completedAt;
      await update({ completedPointIndexes: [0, 1, 2] });
      expect(messageService.createMessage).toHaveBeenCalledTimes(1);
      expect(
        source === WorkSource.CLIENT
          ? (item as ProjectTask).completedAt
          : (item as ProjectIssue).resolvedAt,
      ).toEqual(completedAt);

      const reopened = await update({
        completedPointIndexes: [1],
        status: 'resolved',
        progressPercent: 100,
      });
      expect(reopened.completedPointIndexes).toEqual([1]);
      expect(reopened.progressPercent).toBe(33);
      expect(reopened.completedAt).toBeNull();
      expect(reopened.status).toBe(
        source === WorkSource.CLIENT ? 'in_progress' : 'pending',
      );

      const reset = await update({ completedPointIndexes: [] });
      expect(reset.completedPointIndexes).toEqual([]);
      expect(reset.progressPercent).toBe(0);
      expect(reset.status).toBe('pending');
    });

    it.each(
      [[3], [-1], [0.5], [0, 0], ['0'], null].map((indexes) => ({ indexes })),
    )('rejects invalid submitted indexes: %j', async ({ indexes }) => {
      const { save, update } = makeService(source);
      await expect(
        update({ completedPointIndexes: indexes as number[] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(save).not.toHaveBeenCalled();
    });

    it('rejects checklist updates for a paragraph', async () => {
      const { item, save, update } = makeService(source);
      item.description = 'Paragraph';
      await expect(update({ completedPointIndexes: [] })).rejects.toThrow(
        'This assignment has no checklist points',
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('preserves persisted checks for report-only changes and clears them for legacy manual progress', async () => {
      const { item, update } = makeService(source);
      item.completedPointIndexes = [1];
      item.progressPercent = 33;
      const report = await update({ workReport: 'Progress note' });
      expect(report.completedPointIndexes).toEqual([1]);
      const manual = await update({ progressPercent: 50 });
      expect(manual.progressPercent).toBe(50);
      expect(manual.completedPointIndexes).toBeNull();
    });

    it('retains existing access and organization boundaries', async () => {
      const { service, item, save } = makeService(source);
      await expect(
        service.updateProgress(
          { userId: 'unrelated', roles: [] } as JwtPayload,
          ORGANIZATION_ID,
          item.id,
          {
            source,
            completedPointIndexes: [0],
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.updateProgress(
          { ...user, roles: [{ id: 'role-1', roleName: 'ADMIN' }] },
          'other-org',
          item.id,
          {
            source,
            completedPointIndexes: [0],
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(save).not.toHaveBeenCalled();
    });
  },
);

describe('assignment list saved checklist state', () => {
  it('returns persisted empty and checked arrays, and null for legacy rows', async () => {
    const { service, task, issue } = makeService();
    task.completedPointIndexes = [2];
    issue.completedPointIndexes = [];
    const assignments = await service.listAll(ORGANIZATION_ID);
    expect(
      assignments.find((item) => item.type === 'client')?.completedPointIndexes,
    ).toEqual([2]);
    expect(
      assignments.find((item) => item.type === 'internal')
        ?.completedPointIndexes,
    ).toEqual([]);
    task.completedPointIndexes = undefined as unknown as null;
    expect(
      (await service.getMy(ORGANIZATION_ID, ASSIGNEE_ID)).find(
        (item) => item.type === 'client',
      )?.completedPointIndexes,
    ).toBeNull();
  });

  it.each([TaskStatus.ISSUE, TaskStatus.CANCELLED])(
    'preserves client %s state while recording checks',
    async (status) => {
      const { task, update } = makeService();
      task.status = status;
      const saved = await update({ completedPointIndexes: [0] });
      expect(saved.status).toBe(status);
      expect(saved.progressPercent).toBe(33);
    },
  );
});
