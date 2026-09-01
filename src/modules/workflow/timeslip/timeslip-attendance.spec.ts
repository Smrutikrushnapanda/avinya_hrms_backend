import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TimeslipService } from './timeslip.service';
import { Timeslip } from './entities/timeslip.entity';
import { TimeslipApproval } from './entities/timeslip-approval.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { Attendance } from '../../attendance/entities/attendance.entity';
import { AttendanceSettings } from '../../attendance/entities/attendance-settings.entity';
import { AttendanceCalculationService } from '../../attendance/attendance-calculation.service';
import { MessageGateway } from '../../message/message.gateway';
import { MessageService } from '../../message/message.service';

/**
 * Regression tests for the Timeslip → Attendance integration.
 *
 * Production evidence (timeslip c91beca6-104a-4440-af85-9353eb8bb9dc):
 *   APPROVED timeslip with corrected_in = 2026-09-01 04:40 UTC (10:10 IST)
 *   did NOT update the existing attendance row (IN = 06:23 UTC / 11:53 IST).
 *
 * Canonical ID chain:
 *   timeslips.employee_id (employees.id)
 *     → employees.user_id (users.id)
 *     → attendance.user_id (users.id)
 */

describe('Timeslip → Attendance integration', () => {
  let service: TimeslipService;

  const TIMESLIP_ID = 'c91beca6-104a-4440-af85-9353eb8bb9dc';
  const EMPLOYEE_ID = 'fe00da2c-95f0-4b0d-8fdb-4502f32f7057'; // employees.id
  const USER_ID = 'd345d38c-9ea5-4ddc-be2c-48cbe017d421'; // users.id
  const ORG_ID = 'cdb526b3-ee7e-45f2-b990-6902dff53296'; // organization_id
  const ATTENDANCE_ID = 'e4136ca9-a15b-4eaa-9c42-365e2c90951c';
  const DATE = '2026-09-01';

  const mockTimeslipRepo = {
    find: jest.fn(), findOne: jest.fn(), findAndCount: jest.fn(),
    create: jest.fn(), save: jest.fn(), update: jest.fn(),
    delete: jest.fn(), remove: jest.fn(), createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };
  const mockApprovalRepo = {
    find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
    update: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn(),
  };
  const mockEmployeeRepo = {
    find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn(),
  };
  const mockAttendanceRepo = {
    find: jest.fn(), findOne: jest.fn(), save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockAttendanceSettingsRepo = {
    find: jest.fn(), findOne: jest.fn(), manager: { getRepository: jest.fn() },
  };

  // Manager used inside the transaction callback
  const mockManager = {
    createQueryBuilder: jest.fn(), findOne: jest.fn(), update: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn(async (cb) => cb(mockManager)),
  };
  const mockMessageGateway = { emitToUser: jest.fn() };
  const mockMessageService = { createMessage: jest.fn() };

  const insertChain = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const employee = {
    id: EMPLOYEE_ID, userId: USER_ID, organizationId: ORG_ID,
    shiftId: null, branchId: null,
  };

  const productionAttendance = {
    id: ATTENDANCE_ID,
    user: { id: USER_ID },
    attendanceDate: DATE,
    inTime: new Date('2026-09-01T06:23:26.020Z'), // 11:53 IST — late punch
    outTime: null,
    workingMinutes: 0,
    status: 'late',
  };

  // Production-like shift: start 10:00 IST, grace 30 min
  const shiftConfig = {
    workStartTime: '10:00:00', workEndTime: '19:00:00',
    graceMinutes: 30, lateThresholdMinutes: 30,
    timezone: 'Asia/Kolkata', requiredWorkingMinutes: 480,
  };

  const approvedTimeslip = {
    id: TIMESLIP_ID, date: DATE, missing_type: 'IN',
    corrected_in: new Date('2026-09-01T04:40:00.000Z'), // 10:10 IST
    corrected_out: null, reason: 'T', status: 'APPROVED', employee,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockManager.createQueryBuilder.mockReturnValue(insertChain);
    mockManager.update.mockResolvedValue(undefined);
    mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

    // resolveShiftConfigForEmployee: employee without shift/branch → org settings
    mockEmployeeRepo.findOne.mockImplementation(async ({ where }) => {
      if (where.userId && where.organizationId) {
        return { ...employee, shiftId: null, branchId: null };
      }
      return employee;
    });
    mockAttendanceSettingsRepo.findOne.mockResolvedValue({
      workStartTime: '10:00:00', workEndTime: '19:00:00',
      graceMinutes: 30, lateThresholdMinutes: 30,
      timezone: 'Asia/Kolkata', requiredWorkingMinutes: 480,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeslipService,
        { provide: getRepositoryToken(Timeslip), useValue: mockTimeslipRepo },
        { provide: getRepositoryToken(TimeslipApproval), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(Attendance), useValue: mockAttendanceRepo },
        { provide: getRepositoryToken(AttendanceSettings), useValue: mockAttendanceSettingsRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: MessageGateway, useValue: mockMessageGateway },
        { provide: MessageService, useValue: mockMessageService },
        {
          provide: AttendanceCalculationService,
          useClass: AttendanceCalculationService,
        },
      ],
    }).compile();

    service = module.get<TimeslipService>(TimeslipService);
  });

  describe('reapplyAttendanceCorrection — already-APPROVED timeslips', () => {
    it('re-applies the correction for an APPROVED timeslip and REPLACES the existing IN', async () => {
      mockTimeslipRepo.findOne
        .mockResolvedValueOnce(approvedTimeslip)
        .mockResolvedValueOnce(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance) // attendance row (locked)
        .mockResolvedValueOnce(approvedTimeslip); // timeslip re-read in txn

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(mockManager.update).toHaveBeenCalledTimes(1);
      const [entity, criteria, patch] = mockManager.update.mock.calls[0];
      expect(entity).toBe(Attendance);
      expect(criteria).toBe(ATTENDANCE_ID); // no duplicate — existing row updated
      expect(patch.inTime).toEqual(new Date('2026-09-01T04:40:00.000Z'));
      expect(patch.outTime).toBeNull(); // OUT stays NULL
    });

    it('passes the CORRECTED IN into determineAttendanceStatus (not the old punch)', async () => {
      const calcSpy = jest.spyOn(
        AttendanceCalculationService.prototype,
        'determineAttendanceStatus',
      );
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(calcSpy.mock.calls[0][3]).toEqual(
        new Date('2026-09-01T04:40:00.000Z'),
      );
    });

    it('turns the original LATE punch (11:53 IST) into ON-TIME with corrected 10:10 IST', async () => {
      const calc = new AttendanceCalculationService();
      const oldResult = calc.determineAttendanceStatus(
        0, false, shiftConfig, new Date('2026-09-01T06:23:26.020Z'),
      );
      expect(oldResult.punctualityStatus).toBe('late');

      const correctedResult = calc.determineAttendanceStatus(
        0, false, shiftConfig, new Date('2026-09-01T04:40:00.000Z'),
      );
      expect(correctedResult.punctualityStatus).toBe('on-time');
      expect(correctedResult.status).toBe('present');
      expect(correctedResult.completionStatus).toBeNull(); // no clock-out preserved
    });

    it('writes the calculated three-dimension status from the CORRECTED in-time', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      const patch = mockManager.update.mock.calls[0][2];
      expect(patch.punctualityStatus).toBe('on-time');
      expect(patch.status).toBe('present');
      expect(patch.completionStatus).toBeNull();
    });

    it('throws BadRequest for a PENDING timeslip (no correction applied)', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue({
        ...approvedTimeslip,
        status: 'PENDING',
      });

      await expect(
        service.reapplyAttendanceCorrection(TIMESLIP_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFound for a missing timeslip', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(null);
      await expect(
        service.reapplyAttendanceCorrection('no-such-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent — calling twice updates the SAME row, never duplicates', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne.mockImplementation(
        async (entity: any) =>
          entity === Attendance ? productionAttendance : approvedTimeslip,
      );

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);
      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(mockManager.update).toHaveBeenCalledTimes(2);
      for (const call of mockManager.update.mock.calls) {
        expect(call[1]).toBe(ATTENDANCE_ID);
      }
      // ensure-row insert uses the unique (user_id, attendance_date) conflict target
      expect(insertChain.orUpdate).toHaveBeenCalledWith({
        conflict_target: ['user_id', 'attendance_date'],
        overwrite: ['processed_at'],
      });
    });

    it('does NOT create duplicate approval records', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(mockApprovalRepo.save).not.toHaveBeenCalled();
      expect(mockApprovalRepo.create).not.toHaveBeenCalled();
    });

    it('reports a warning (no update) when no attendance row exists for user + date', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne.mockResolvedValueOnce(null);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });

  describe('applyTimeslipToAttendance — lookup criteria & branches', () => {
    it('looks up attendance by timeslip.employee.userId + timeslip date', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      const attendanceLookup = mockManager.findOne.mock.calls[0][1];
      expect(attendanceLookup.where).toEqual({
        user: { id: USER_ID }, // NOT employeeId — resolved via employees.userId
        attendanceDate: DATE, // timeslip business date, not server date
      });
    });

    it('replaces only OUT when missing_type = OUT, preserving existing IN', async () => {
      const outTimeslip = {
        ...approvedTimeslip,
        missing_type: 'OUT',
        corrected_in: null,
        corrected_out: new Date('2026-09-01T10:30:00.000Z'),
      };
      mockTimeslipRepo.findOne.mockResolvedValue(outTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(outTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      const patch = mockManager.update.mock.calls[0][2];
      expect(patch.inTime).toEqual(new Date('2026-09-01T06:23:26.020Z')); // preserved
      expect(patch.outTime).toEqual(new Date('2026-09-01T10:30:00.000Z')); // replaced
    });

    it('skips with a warning (no crash) when the timeslip employee has no userId', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue({
        ...approvedTimeslip,
        employee: { ...employee, userId: null },
      });

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('does NOT apply the correction when the timeslip is no longer APPROVED in-txn', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce({ ...approvedTimeslip, status: 'REJECTED' });

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      // Only processedAt refresh, no IN/OUT/status overwrite
      const patch = mockManager.update.mock.calls[0][2];
      expect(patch).toEqual({ processedAt: expect.any(Date) });
    });

    it('normalizes the timeslip date to yyyy-MM-dd', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);

      await service.reapplyAttendanceCorrection(TIMESLIP_ID);

      const attendanceLookup = mockManager.findOne.mock.calls[0][1];
      expect(attendanceLookup.where.attendanceDate).toBe('2026-09-01');
    });
  });

  describe('update() — PATCH path must apply the correction', () => {
    it('applies the attendance correction when the update sets status to APPROVED', async () => {
      // findOne calls: org assertion, post-update refetch, apply lookup, org assertion 2
      mockTimeslipRepo.findOne.mockResolvedValue(approvedTimeslip);
      mockManager.findOne
        .mockResolvedValueOnce(productionAttendance)
        .mockResolvedValueOnce(approvedTimeslip);
      mockTimeslipRepo.update.mockResolvedValue(undefined);

      await service.update(TIMESLIP_ID, { status: 'APPROVED' as any });

      expect(mockManager.update).toHaveBeenCalled();
      const patch = mockManager.update.mock.calls[0][2];
      expect(patch.inTime).toEqual(new Date('2026-09-01T04:40:00.000Z'));
    });
  });
});

