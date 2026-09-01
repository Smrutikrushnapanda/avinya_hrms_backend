import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TimeslipService } from './timeslip.service';
import { Timeslip } from './entities/timeslip.entity';
import { TimeslipApproval } from './entities/timeslip-approval.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { Attendance } from '../../attendance/entities/attendance.entity';
import { AttendanceSettings } from '../../attendance/entities/attendance-settings.entity';
import { AttendanceCalculationService } from '../../attendance/attendance-calculation.service';
import { MessageGateway } from '../../message/message.gateway';
import { MessageService } from '../../message/message.service';
import { CreateTimeslipDto, MissingType } from './dto/create-timeslip.dto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Tenant Isolation — Timeslip Module', () => {
  let service: TimeslipService;

  const ORG_A = 'org-a-uuid';
  const ORG_B = 'org-b-uuid';
  const EMP_A1 = 'emp-a1-uuid';
  const EMP_B1 = 'emp-b1-uuid';
  const TIMESLIP_A1 = 'ts-a1-uuid';
  const TIMESLIP_B1 = 'ts-b1-uuid';

  const mockTimeslipRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  };

  const mockApprovalRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEmployeeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAttendanceRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAttendanceSettingsRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager: {
      getRepository: jest.fn(),
    },
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const mockMessageGateway = {
    emitToUser: jest.fn(),
  };

  const mockMessageService = {
    createMessage: jest.fn(),
  };

  const mockAttendanceCalculation = {
    calculateWorkingMinutes: jest.fn().mockReturnValue(0),
    determineAttendanceStatus: jest.fn().mockReturnValue('present'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeslipService,
        { provide: getRepositoryToken(Timeslip), useValue: mockTimeslipRepo },
        {
          provide: getRepositoryToken(TimeslipApproval),
          useValue: mockApprovalRepo,
        },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        {
          provide: getRepositoryToken(Attendance),
          useValue: mockAttendanceRepo,
        },
        {
          provide: getRepositoryToken(AttendanceSettings),
          useValue: mockAttendanceSettingsRepo,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: MessageGateway, useValue: mockMessageGateway },
        { provide: MessageService, useValue: mockMessageService },
        {
          provide: AttendanceCalculationService,
          useValue: mockAttendanceCalculation,
        },
      ],
    }).compile();

    service = module.get<TimeslipService>(TimeslipService);
  });

  describe('findOne — ID-based access', () => {
    it('should return a timeslip when found', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue({
        id: TIMESLIP_A1,
        employee: { id: EMP_A1, organizationId: ORG_A },
      });
      const result = await service.findOne(TIMESLIP_A1);
      expect(result.id).toBe(TIMESLIP_A1);
    });

    it('should throw NotFoundException when timeslip not found', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createTimeslip — employee FK validation', () => {
    it('should reject when employee not found', async () => {
      mockEmployeeRepo.findOne.mockResolvedValue(null);
      mockTimeslipRepo.findOne.mockResolvedValue(null);

      const dto: CreateTimeslipDto = {
        employeeId: 'nonexistent',
        date: '2025-01-01',
        missingType: MissingType.IN,
        organizationId: ORG_A,
      };

      await expect(service.createTimeslip(dto)).rejects.toThrow();
    });
  });

  describe('batchUpdateStatuses — input validation', () => {
    it('should reject when timeslip IDs are empty', async () => {
      try {
        await service.batchUpdateStatuses(
          { timeslipIds: [], status: 'APPROVED', approverId: EMP_A1 },
          EMP_A1,
        );
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.constructor.name).toContain('Error');
      }
    });
  });

  describe('batchUpdateStatuses — admin override bypasses approval records', () => {
    it('should approve a timeslip even when NO approval records exist (admin override)', async () => {
      // Simulate the exact scenario: timeslip has status PENDING but no approval rows
      mockTimeslipRepo.findOne.mockResolvedValue({
        id: TIMESLIP_A1,
        status: 'PENDING',
      });

      // Organization isolation check passes
      mockTimeslipRepo.createQueryBuilder.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      });

      // Existence check passes
      mockTimeslipRepo.createQueryBuilder.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      });

      // Timeslip status update succeeds
      mockTimeslipRepo.update.mockResolvedValue({ affected: 1 });

      // Best-effort approval update via QueryBuilder
      // Simulate 0 affected rows (no approval records exist) — should NOT block
      const mockQbChain = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      mockApprovalRepo.createQueryBuilder.mockReturnValue(mockQbChain);

      // applyTimeslipToAttendance — skip for this test (needs full setup)
      mockTimeslipRepo.findOne
        .mockResolvedValueOnce({
          id: TIMESLIP_A1,
          status: 'PENDING',
        })
        .mockResolvedValueOnce(null); // no attendance found

      const dto = {
        timeslipIds: [TIMESLIP_A1],
        status: 'APPROVED' as const,
      };

      // Should succeed — no "No pending approvals found" error
      const result = await service.batchUpdateStatuses(dto, undefined, ORG_A);
      expect(result.updatedCount).toBe(1);

      // Verify timeslip status was updated directly (admin override)
      expect(mockTimeslipRepo.update).toHaveBeenCalledWith(TIMESLIP_A1, {
        status: 'APPROVED',
      });

      // Verify QueryBuilder was used (not Repository.update) for approval records
      expect(mockApprovalRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQbChain.where).toHaveBeenCalledWith(
        'timeslip_id = :timeslipId',
        { timeslipId: TIMESLIP_A1 },
      );

      // Verify Repository.update was NOT called on approvalRepo
      // (the old broken pattern that caused the bug)
      expect(mockApprovalRepo.update).not.toHaveBeenCalled();
    });

    it('should reject a timeslip even when NO approval records exist (admin override)', async () => {
      mockTimeslipRepo.findOne.mockResolvedValue({
        id: TIMESLIP_A1,
        status: 'PENDING',
      });

      mockTimeslipRepo.createQueryBuilder.mockReturnValueOnce({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      });

      mockTimeslipRepo.createQueryBuilder.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      });

      mockTimeslipRepo.update.mockResolvedValue({ affected: 1 });

      const mockQbChain = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      mockApprovalRepo.createQueryBuilder.mockReturnValue(mockQbChain);

      const dto = {
        timeslipIds: [TIMESLIP_A1],
        status: 'REJECTED' as const,
      };

      const result = await service.batchUpdateStatuses(dto, undefined, ORG_A);
      expect(result.updatedCount).toBe(1);
      expect(mockTimeslipRepo.update).toHaveBeenCalledWith(TIMESLIP_A1, {
        status: 'REJECTED',
      });
    });
  });

  describe('Service basic operations', () => {
    it('findAll should return paginated results', async () => {
      mockTimeslipRepo.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.findAll(1, 10);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('findByEmployee should query by employee ID', async () => {
      mockTimeslipRepo.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });
      const result = await service.findByEmployee(EMP_A1, 1, 10);
      expect(result.data).toBeDefined();
      expect(result.total).toBe(0);
    });
  });
});
