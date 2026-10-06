import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { TimesheetService } from './timesheet.service';
import { Timesheet } from './entities/timesheet.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { OrganizationTimezoneService } from 'src/shared/organization-timezone.service';

describe('TimesheetService – weekly timesheet lifecycle & Saturday deadline', () => {
  let service: TimesheetService;
  let timezoneMock: {
    getToday: jest.Mock;
    getOrganizationTimezone: jest.Mock;
    getNow: jest.Mock;
  };
  let timesheetRepoMock: {
    findOne: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const organizationId = 'org-1';
  const employeeId = 'emp-1';
  const otherEmployeeId = 'emp-2';
  const entryId = 'ts-1';
  const timezone = 'Asia/Kolkata';

  const makeEntry = (
    overrides: Partial<Timesheet> = {},
  ): Partial<Timesheet> => ({
    id: entryId,
    organizationId,
    employeeId,
    date: '2026-10-07',
    startTime: new Date('2026-10-07T04:30:00.000Z'),
    endTime: new Date('2026-10-07T06:30:00.000Z'),
    workingMinutes: 120,
    workDescription: 'Feature work',
    ...overrides,
  });

  beforeEach(async () => {
    timezoneMock = {
      getToday: jest.fn(),
      getOrganizationTimezone: jest.fn().mockResolvedValue(timezone),
      getNow: jest.fn(),
    };
    timesheetRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const qb: Record<string, jest.Mock> = {};
        qb.where = jest.fn().mockReturnValue(qb);
        qb.andWhere = jest.fn().mockReturnValue(qb);
        qb.getOne = jest.fn().mockResolvedValue(null);
        return qb;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TimesheetService,
        { provide: 'TimesheetRepository', useValue: timesheetRepoMock },
        { provide: 'EmployeeRepository', useValue: { findOne: jest.fn() } },
        { provide: OrganizationTimezoneService, useValue: timezoneMock },
      ],
    }).compile();

    service = moduleRef.get(TimesheetService);
  });

  describe('Active week editing (Wednesday Oct 7, 2026)', () => {
    beforeEach(() => {
      // Wednesday Oct 7, 2026 14:00:00 IST
      const now = DateTime.fromISO('2026-10-07T14:00:00.000', { zone: timezone });
      timezoneMock.getNow.mockResolvedValue(now);
      timezoneMock.getToday.mockResolvedValue('2026-10-07');
    });

    it('allows editing and deleting entries from Monday Oct 5 within current week', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-05' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Updated Monday work',
        }),
      ).resolves.toBeDefined();

      await expect(service.deleteTimesheet(entryId, employeeId)).resolves.toEqual({
        success: true,
      });
    });

    it('allows editing and deleting entries from today (Wednesday Oct 7)', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-07' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Updated Wednesday work',
        }),
      ).resolves.toBeDefined();

      await expect(service.deleteTimesheet(entryId, employeeId)).resolves.toEqual({
        success: true,
      });
    });

    it('rejects editing future date entries (Thursday Oct 8)', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-08' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Future edit',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects editing previous week entries (Saturday Oct 3) with 403 Forbidden', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-03' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Past week edit',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Saturday deadline (Saturday Oct 10, 2026)', () => {
    it('allows editing on Saturday before midnight (23:00 IST)', async () => {
      const satNow = DateTime.fromISO('2026-10-10T23:00:00.000', { zone: timezone });
      timezoneMock.getNow.mockResolvedValue(satNow);
      timezoneMock.getToday.mockResolvedValue('2026-10-10');

      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-10' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Saturday final log',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('Sunday transition / reset day (Sunday Oct 11, 2026)', () => {
    beforeEach(() => {
      // Sunday Oct 11, 2026 09:00:00 IST
      const sunNow = DateTime.fromISO('2026-10-11T09:00:00.000', { zone: timezone });
      timezoneMock.getNow.mockResolvedValue(sunNow);
      timezoneMock.getToday.mockResolvedValue('2026-10-11');
    });

    it('rejects editing previous week Saturday Oct 10 entry because deadline passed (403)', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-10' }));

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Late edit on Sunday',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects editing previous week Friday Oct 9 entry on Sunday (403)', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: '2026-10-09' }));

      await expect(
        service.deleteTimesheet(entryId, employeeId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Authorization and not found checks', () => {
    beforeEach(() => {
      const now = DateTime.fromISO('2026-10-07T14:00:00.000', { zone: timezone });
      timezoneMock.getNow.mockResolvedValue(now);
      timezoneMock.getToday.mockResolvedValue('2026-10-07');
    });

    it('rejects editing another employee’s entry regardless of date', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(
        makeEntry({ employeeId: otherEmployeeId, date: '2026-10-07' }),
      );

      await expect(
        service.updateTimesheet(entryId, employeeId, {
          workDescription: 'Not mine',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects deleting another employee’s entry regardless of date', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(
        makeEntry({ employeeId: otherEmployeeId, date: '2026-10-07' }),
      );

      await expect(service.deleteTimesheet(entryId, employeeId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects edit/delete for a missing entry', async () => {
      timesheetRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateTimesheet(entryId, employeeId, {}),
      ).rejects.toThrow(NotFoundException);
      await expect(service.deleteTimesheet(entryId, employeeId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
