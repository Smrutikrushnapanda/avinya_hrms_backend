import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TimesheetService } from './timesheet.service';
import { Timesheet } from './entities/timesheet.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { OrganizationTimezoneService } from 'src/shared/organization-timezone.service';

/**
 * Midnight boundary test for the employee timesheet lock:
 * once the organization's local clock passes 12:00 AM, entries dated with
 * the previous organization day must be read-only for the employee
 * (edit + delete rejected at the service layer, so direct API calls are blocked too).
 */
describe('TimesheetService – midnight edit/delete lock', () => {
  let service: TimesheetService;
  let timezoneMock: { getToday: jest.Mock; getOrganizationTimezone: jest.Mock };
  let timesheetRepoMock: { findOne: jest.Mock; save: jest.Mock; remove: jest.Mock; create: jest.Mock; createQueryBuilder: jest.Mock };

  const organizationId = 'org-1';
  const employeeId = 'emp-1';
  const otherEmployeeId = 'emp-2';
  const entryId = 'ts-1';

  // Yesterday (org local) and today (org local) around a midnight rollover:
  // Aug 31 11:59 PM IST → Sep 1 12:00 AM IST.
  const yesterday = '2026-08-31';
  const today = '2026-09-01';

  const makeEntry = (overrides: Partial<Timesheet> = {}): Partial<Timesheet> => ({
    id: entryId,
    organizationId,
    employeeId,
    date: yesterday,
    startTime: new Date('2026-08-31T04:30:00.000Z'),
    endTime: new Date('2026-08-31T06:30:00.000Z'),
    workingMinutes: 120,
    workDescription: 'Feature work',
    ...overrides,
  });

  beforeEach(async () => {
    timezoneMock = {
      getToday: jest.fn().mockResolvedValue(today),
      getOrganizationTimezone: jest.fn().mockResolvedValue('Asia/Kolkata'),
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

  it('AUG 31 11:59 PM: today-dated entries are editable and deletable', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: today }));

    // No-op overlap query (mocked QB above returns no conflict).
    await expect(
      service.updateTimesheet(entryId, employeeId, { workDescription: 'Updated' }),
    ).resolves.toBeDefined();
    await expect(service.deleteTimesheet(entryId, employeeId)).resolves.toEqual({ success: true });
  });

  it('SEP 1 12:00 AM: yesterday-dated entries can no longer be edited (403)', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: yesterday }));

    await expect(
      service.updateTimesheet(entryId, employeeId, { workDescription: 'Attempted after midnight' }),
    ).rejects.toThrow(ForbiddenException);
    expect(timesheetRepoMock.save).not.toHaveBeenCalled();
  });

  it('SEP 1 12:00 AM: yesterday-dated entries can no longer be deleted (403)', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ date: yesterday }));

    await expect(service.deleteTimesheet(entryId, employeeId)).rejects.toThrow(ForbiddenException);
    expect(timesheetRepoMock.remove).not.toHaveBeenCalled();
  });

  it('rejects editing another employee’s entry regardless of date', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ employeeId: otherEmployeeId, date: today }));

    await expect(
      service.updateTimesheet(entryId, employeeId, { workDescription: 'Not mine' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects deleting another employee’s entry regardless of date', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(makeEntry({ employeeId: otherEmployeeId, date: today }));

    await expect(service.deleteTimesheet(entryId, employeeId)).rejects.toThrow(ForbiddenException);
  });

  it('rejects edit/delete for a missing entry', async () => {
    timesheetRepoMock.findOne.mockResolvedValue(null);

    await expect(service.updateTimesheet(entryId, employeeId, {})).rejects.toThrow(NotFoundException);
    await expect(service.deleteTimesheet(entryId, employeeId)).rejects.toThrow(NotFoundException);
  });
});
