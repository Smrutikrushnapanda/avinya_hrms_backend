import { ForbiddenException } from '@nestjs/common';
import { AssignWorkService, WorkAssignment } from './assign-work.service';
import { ProjectsService } from '../clients/projects.service';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { WorkSource } from './dto/create-assign-work.dto';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const WINDOW = 48 * 60 * 60 * 1000;
const assignee = {
  userId: 'assignee',
  organizationId: 'org',
  roles: [],
} as JwtPayload;
const assigner = { ...assignee, userId: 'assigner' };
const admin = {
  ...assignee,
  userId: 'admin',
  roles: [{ id: 'admin-role', roleName: 'ADMIN' }],
};

function fixture(kind: 'client' | 'internal' | 'external', age: number) {
  const item = {
    id: 'work',
    organizationId: 'org',
    projectId: null,
    assignedByUserId: 'assigner',
    assignedToUserId: 'assignee',
    createdByUserId: 'assigner',
    assigneeUserId: 'assignee',
    title: 'Work',
    issueTitle: 'Work',
    description: 'Work description',
    externalAssignerName: kind === 'external' ? 'Meeting contact' : null,
    assignmentDate: '2020-01-01',
    createdAt: new Date(NOW - age),
    updatedAt: new Date(NOW),
  };
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(item),
    remove: jest.fn().mockResolvedValue(item),
    save: jest.fn().mockResolvedValue(item),
  };
  const issueRepo = {
    findOne: jest.fn().mockResolvedValue(item),
    remove: jest.fn().mockResolvedValue(item),
    save: jest.fn().mockResolvedValue(item),
  };
  const service = Object.create(
    AssignWorkService.prototype,
  ) as AssignWorkService;
  Object.assign(service, {
    taskRepo,
    issueRepo,
    clientProjectRepo: {
      findOne: jest.fn().mockResolvedValue({ organizationId: 'org' }),
    },
    loadAssignments: jest.fn().mockResolvedValue([
      {
        ...item,
        type: kind === 'internal' ? 'internal' : 'client',
      } as unknown as WorkAssignment,
    ]),
  });
  const source = kind === 'internal' ? WorkSource.INTERNAL : WorkSource.CLIENT;
  const remove = kind === 'internal' ? issueRepo.remove : taskRepo.remove;
  return { service, item, remove, source, taskRepo, issueRepo };
}

describe.each(['client', 'internal', 'external'] as const)(
  '%s assignment deletion window',
  (kind) => {
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => jest.restoreAllMocks());

    it.each([0, WINDOW - 1])(
      'allows permitted deletion at age %i ms',
      async (age) => {
        for (const actor of [assignee, assigner, admin]) {
          const { service, source, remove } = fixture(kind, age);
          await expect(
            service.remove(actor, 'org', 'work', source),
          ).resolves.toEqual({ success: true });
          expect(remove).toHaveBeenCalledTimes(1);
        }
      },
    );

    it.each([WINDOW, WINDOW + 1, WINDOW * 2])(
      'blocks all roles at age %i ms',
      async (age) => {
        for (const actor of [assignee, assigner, admin]) {
          const { service, source, remove } = fixture(kind, age);
          await expect(
            service.remove(actor, 'org', 'work', source),
          ).rejects.toThrow('within 48 hours');
          expect(remove).not.toHaveBeenCalled();
        }
      },
    );

    it('preserves permission and tenant checks during the deletion window', async () => {
      const { service, source, remove } = fixture(kind, 1000);
      await expect(
        service.remove(
          { ...assignee, userId: 'unrelated' },
          'org',
          'work',
          source,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.remove(admin, 'other-org', 'work', source),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(remove).not.toHaveBeenCalled();
    });

    it('expires delete capability without restricting edits or resetting age on edit', async () => {
      const { service, source, item, remove } = fixture(kind, WINDOW);
      const [row] = await service.listAll(
        'org',
        undefined,
        undefined,
        undefined,
        assignee,
      );
      expect(row.canDelete).toBe(false);
      expect(row.canEdit).toBe(true);
      await expect(
        service.updateAssignment(assignee, 'work', {
          source,
          title: 'Edited work',
        }),
      ).resolves.toBe(item);
      await expect(
        service.remove(assignee, 'org', 'work', source),
      ).rejects.toThrow('within 48 hours');
      expect(remove).not.toHaveBeenCalled();
    });

    it('rechecks cutoff after an assignment was listed as deletable', async () => {
      const { service, source, remove } = fixture(kind, WINDOW - 1);
      expect(
        (
          await service.listAll(
            'org',
            undefined,
            undefined,
            undefined,
            assignee,
          )
        )[0].canDelete,
      ).toBe(true);
      jest.spyOn(Date, 'now').mockReturnValue(NOW + 1);
      await expect(
        service.remove(assignee, 'org', 'work', source),
      ).rejects.toThrow('within 48 hours');
      expect(remove).not.toHaveBeenCalled();
    });

    it.each([Number.NaN, -1])(
      'rejects invalid/future creation timestamps: %s',
      async (age) => {
        const { service, source, remove } = fixture(kind, age);
        await expect(
          service.remove(assignee, 'org', 'work', source),
        ).rejects.toThrow('within 48 hours');
        expect(remove).not.toHaveBeenCalled();
      },
    );
  },
);

describe('project task delete endpoint uses the same assignment cutoff', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());
  it.each([WINDOW - 1, WINDOW])('checks creation age %i ms', async (age) => {
    const { taskRepo } = fixture('client', age);
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    Object.assign(service, {
      taskRepo,
      employeeRepo: { findOne: jest.fn().mockResolvedValue(null) },
    });
    if (age < WINDOW) {
      await expect(
        service.deleteTask('work', 'assignee', 'org'),
      ).resolves.toEqual({ success: true });
      expect(taskRepo.remove).toHaveBeenCalledTimes(1);
    } else {
      await expect(
        service.deleteTask('work', 'assignee', 'org'),
      ).rejects.toThrow('within 48 hours');
      expect(taskRepo.remove).not.toHaveBeenCalled();
    }
  });
});
