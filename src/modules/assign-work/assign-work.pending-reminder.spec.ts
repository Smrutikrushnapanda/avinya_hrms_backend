import { AssignWorkService } from './assign-work.service';

/**
 * Tests the 24-hour PENDING-work reminder orchestration (Task 13).
 * The date-filtering SQL is exercised via mocked query-builder rows; these
 * tests pin down the orchestration contract: every overdue pending item sends
 * one in-app notification to the ASSIGNEE (from the assigner), includes the
 * assignee's full name, and is stamped with the reminder timestamp so it never
 * fires twice for the same assignment.
 */
describe('AssignWorkService — 24h pending-work reminder', () => {
  const ORG_ID = 'org-1111-2222-3333-444444444444';
  const ASSIGNER_ID = 'user-aaaa-1111-2222-333333333333';
  const ASSIGNEE_ID = 'user-bbbb-9999-8888-777777777777';

  const buildQueryBuilder = (rows: unknown[]) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  });

  const createService = ({ taskRows, issueRows }: any = {}) => {
    const messageService = {
      createMessage: jest
        .fn()
        .mockResolvedValue({ recipientUserIds: [], message: {} }),
    };
    const messageGateway = {
      emitToUsers: jest.fn(),
      emitToUser: jest.fn(),
    };
    const firebaseService = {
      sendToTokens: jest.fn().mockResolvedValue({ invalidTokens: [] }),
    };
    const taskRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilder(taskRows)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const issueRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(buildQueryBuilder(issueRows)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const employeeRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: ASSIGNEE_ID,
          firstName: 'Aarav',
          middleName: '',
          lastName: 'Sharma',
        },
      ]),
    };

    const service = new AssignWorkService(
      taskRepo as any,
      { find: jest.fn() } as any,
      issueRepo as any,
      { find: jest.fn() } as any,
      employeeRepo as any,
      { find: jest.fn() } as any,
      messageService as any,
      messageGateway as any,
      firebaseService as any,
    );

    return {
      service,
      taskRepo,
      issueRepo,
      messageService,
      firebaseService,
    };
  };

  const NOW = new Date('2026-10-09T12:00:00.000Z');

  it('notifies the assignee once per overdue pending client task', async () => {
    const { service, taskRepo, issueRepo, messageService } = createService({
      taskRows: [
        {
          id: 'task-1',
          title: 'Fix login redirect',
          assigned_by_user_id: ASSIGNER_ID,
          assigned_to_user_id: ASSIGNEE_ID,
          organization_id: ORG_ID,
        },
        {
          id: 'task-2',
          title: 'Write API docs',
          assigned_by_user_id: ASSIGNER_ID,
          assigned_to_user_id: ASSIGNEE_ID,
          organization_id: ORG_ID,
        },
      ],
      issueRows: [],
    });

    const count = await service.remindPendingWork(NOW);

    expect(count).toBe(2);
    expect(messageService.createMessage).toHaveBeenCalledTimes(2);
    expect(messageService.createMessage).toHaveBeenCalledWith(
      ASSIGNER_ID,
      expect.objectContaining({
        organizationId: ORG_ID,
        recipientUserIds: [ASSIGNEE_ID],
        title: 'Work Still Pending: Fix login redirect',
        type: 'work_reminder',
      }),
    );
    expect(messageService.createMessage).toHaveBeenCalledWith(
      ASSIGNER_ID,
      expect.objectContaining({
        body: expect.stringContaining('Aarav Sharma'),
      }),
    );
    expect(taskRepo.update).toHaveBeenCalledTimes(2);
    expect(taskRepo.update).toHaveBeenCalledWith(
      'task-1',
      { statusReminderSentAt: NOW },
    );
    expect(issueRepo.update).not.toHaveBeenCalled();
  });

  it('notifies the assignee for overdue pending internal issues too', async () => {
    const { service, taskRepo, issueRepo, messageService } = createService({
      taskRows: [],
      issueRows: [
        {
          id: 'issue-1',
          issue_title: 'Bug on profile save',
          created_by_user_id: ASSIGNER_ID,
          assignee_user_id: ASSIGNEE_ID,
          organization_id: ORG_ID,
        },
      ],
    });

    const count = await service.remindPendingWork(NOW);

    expect(count).toBe(1);
    expect(messageService.createMessage).toHaveBeenCalledWith(
      ASSIGNER_ID,
      expect.objectContaining({
        recipientUserIds: [ASSIGNEE_ID],
        title: 'Work Still Pending: Bug on profile save',
        type: 'work_reminder',
        body: expect.stringContaining('Aarav Sharma'),
      }),
    );
    expect(issueRepo.update).toHaveBeenCalledWith(
      'issue-1',
      { statusReminderSentAt: NOW },
    );
    expect(taskRepo.update).not.toHaveBeenCalled();
  });

  it('does nothing when no work crossed the 24h boundary', async () => {
    const { service, messageService, taskRepo, issueRepo } = createService({
      taskRows: [],
      issueRows: [],
    });

    const count = await service.remindPendingWork(NOW);

    expect(count).toBe(0);
    expect(messageService.createMessage).not.toHaveBeenCalled();
    expect(taskRepo.update).not.toHaveBeenCalled();
    expect(issueRepo.update).not.toHaveBeenCalled();
  });

  it('skips rows without an assignee, assigner or organization (data safety)', async () => {
    const { service, messageService } = createService({
      taskRows: [
        {
          id: 'task-orphan',
          title: 'Orphan row',
          assigned_by_user_id: ASSIGNER_ID,
          assigned_to_user_id: null,
          organization_id: ORG_ID,
        },
      ],
      issueRows: [],
    });

    const count = await service.remindPendingWork(NOW);

    expect(count).toBe(0);
    expect(messageService.createMessage).not.toHaveBeenCalled();
  });
});