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

/**
 * REGRESSION — ERROR 2: getFallbackApproverId() "column distinctAlias.Employee_id does not exist"
 *
 * Root cause:
 *   getFallbackApproverId() used:
 *     select: ['branchId', 'manager']
 *
 *   'manager' is a RELATION name, not a column name. TypeORM's FindOptions.select
 *   only accepts column names. Including a relation name caused TypeORM to generate
 *   invalid DISTINCT SQL with `distinctAlias.Employee_id` (capital E, entity-prefixed)
 *   which doesn't exist in the employees table.
 *
 * Fix:
 *   Changed select to ['id'] — only column names. The relation is properly loaded
 *   via `relations: ['manager']`.
 */
describe('REGRESSION — getFallbackApproverId select fix', () => {
  let service: TimeslipService;

  const EMPLOYEE_ID = 'fe00da2c-95f0-4b0d-8fdb-4502f32f7057';
  const ORG_ID = 'cdb526b3-ee7e-45f2-b990-6902dff53296';
  const MANAGER_ID = 'aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee';
  const ADMIN_EMP_ID = 'ffff2222-3333-4444-5555-666666666666';

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
    manager: { getRepository: jest.fn() },
  };
  const mockDataSource = {
    query: jest.fn(),
    transaction: jest.fn(async (cb: any) => cb({})),
  };
  const mockMessageGateway = { emitToUser: jest.fn() };
  const mockMessageService = { createMessage: jest.fn() };

  const createQB = () => {
    const chain: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return chain;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEmployeeRepo.createQueryBuilder.mockReturnValue(createQB());
    mockTimeslipRepo.createQueryBuilder.mockReturnValue(createQB());

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
          useClass: AttendanceCalculationService,
        },
      ],
    }).compile();

    service = module.get<TimeslipService>(TimeslipService);
  });

  describe('getFallbackApproverId — step 1: reporting manager', () => {
    it('returns manager ID when employee has a reporting manager', async () => {
      mockEmployeeRepo.findOne.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        manager: { id: MANAGER_ID },
      });

      const result = (service as any).getFallbackApproverId(
        ORG_ID,
        EMPLOYEE_ID,
      );

      const resolved = await result;
      expect(resolved).toBe(MANAGER_ID);

      // Verify the findOne call uses correct select (only column names, no relation names)
      const findOneCall = mockEmployeeRepo.findOne.mock.calls[0][0];
      expect(findOneCall.select).toEqual(['id']);
      expect(findOneCall.relations).toEqual(['manager']);
      // CRITICAL: 'manager' must NOT appear in select — it's a relation, not a column
      expect(findOneCall.select).not.toContain('manager');
    });

    it('does NOT include relation names in select array', async () => {
      mockEmployeeRepo.findOne.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        manager: { id: MANAGER_ID },
      });

      await (service as any).getFallbackApproverId(ORG_ID, EMPLOYEE_ID);

      const findOneCall = mockEmployeeRepo.findOne.mock.calls[0][0];
      // Every item in select must be a column name (not a relation)
      for (const item of findOneCall.select) {
        expect([
          'id',
          'branchId',
          'userId',
          'organizationId',
          'reportingTo',
          'employeeCode',
          'firstName',
          'lastName',
          'status',
          'createdAt',
          'updatedAt',
          'departmentId',
          'designationId',
          'shiftId',
          'dateOfJoining',
          'dateOfExit',
          'employmentType',
          'gender',
          'dateOfBirth',
          'contactNumber',
          'personalEmail',
          'workEmail',
          'photoUrl',
          'middleName',
          'bloodGroup',
          'emergencyContactName',
          'emergencyContactRelationship',
          'emergencyContactPhone',
          'aadharPhotoUrl',
          'panCardPhotoUrl',
          'passportPhotoUrl',
        ]).toContain(item);
      }
    });
  });

  describe('getFallbackApproverId — step 2: admin/HR fallback', () => {
    it('falls back to admin/HR user when no reporting manager', async () => {
      // Step 1: no manager
      mockEmployeeRepo.findOne
        .mockResolvedValueOnce({ id: EMPLOYEE_ID, manager: null })
        .mockResolvedValueOnce({ id: ADMIN_EMP_ID });

      // Step 2: raw SQL returns admin user
      mockDataSource.query.mockResolvedValueOnce([
        { user_id: 'admin-user-id' },
      ]);

      const result = await (service as any).getFallbackApproverId(
        ORG_ID,
        EMPLOYEE_ID,
      );
      expect(result).toBe(ADMIN_EMP_ID);
    });

    it('returns employee ID (self-approve) when no admin/HR found', async () => {
      mockEmployeeRepo.findOne.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        manager: null,
      });
      mockDataSource.query.mockResolvedValueOnce([]);
      // Step 3: no other employee
      const qb = createQB();
      qb.getOne.mockResolvedValue(null);
      mockEmployeeRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).getFallbackApproverId(
        ORG_ID,
        EMPLOYEE_ID,
      );
      expect(result).toBe(EMPLOYEE_ID);
    });
  });

  describe('getFallbackApproverId — step 3: any other employee', () => {
    it('falls back to any other employee when no admin/HR and no manager', async () => {
      const OTHER_EMP_ID = 'other-employee-id';
      mockEmployeeRepo.findOne.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        manager: null,
      });
      mockDataSource.query.mockResolvedValueOnce([]);

      const qb = createQB();
      qb.getOne.mockResolvedValue({ id: OTHER_EMP_ID });
      mockEmployeeRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await (service as any).getFallbackApproverId(
        ORG_ID,
        EMPLOYEE_ID,
      );
      expect(result).toBe(OTHER_EMP_ID);
    });
  });

  describe('getFallbackApproverId — uses real employee ID pattern', () => {
    it('works with the production employee ID that caused the error', async () => {
      // Simulate the production scenario: employee fe00da2c-... with no manager
      mockEmployeeRepo.findOne.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        manager: null,
      });

      // Admin query returns an admin user
      mockDataSource.query.mockResolvedValueOnce([
        { user_id: 'admin-user-id' },
      ]);
      mockEmployeeRepo.findOne.mockResolvedValueOnce({ id: ADMIN_EMP_ID });

      const result = await (service as any).getFallbackApproverId(
        ORG_ID,
        EMPLOYEE_ID,
      );
      expect(result).toBe(ADMIN_EMP_ID);
      expect(result).not.toBe(EMPLOYEE_ID); // should not self-approve when admin exists
    });
  });
});
