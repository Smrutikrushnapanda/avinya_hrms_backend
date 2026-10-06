import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmployeeService } from './employee.service';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { Branch } from '../attendance/entities/branch.entity';
import { AttendanceShift } from '../attendance/entities/attendance-shift.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Role } from '../auth-core/entities/role.entity';
import { User } from '../auth-core/entities/user.entity';
import { ResignationRequest } from '../resignation/entities/resignation-request.entity';
import { WorkflowAssignment } from '../workflow/entities/workflow-assignment.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { Timeslip } from '../workflow/timeslip/entities/timeslip.entity';
import { EmployeeProjectAssignment } from './entities/employee-project-assignment.entity';
import { Project } from '../project/entities/project.entity';
import { ClientProject } from '../clients/entities/project.entity';
import { ProjectMember } from '../project/entities/project-member.entity';
import { ClientProjectMember } from '../clients/entities/client-project-member.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UsersService } from '../auth-core/services/users.service';
import { LeaveService } from '../leave/leave.service';
import { WfhService } from '../wfh/wfh.service';
import { StorageService } from '../attendance/storage.service';
import { MailService } from '../mail/mail.service';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';
import { EntityManager } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('EmployeeService — Multiple Managers & Deactivation', () => {
  let service: EmployeeService;

  const ORG_ID = 'org-1111-2222-3333-444444444444';
  const EMP_ID = 'emp-1111-2222-3333-444444444444';
  const MGR_A_ID = 'mgr-aaaa-1111-2222-333333333333';
  const MGR_B_ID = 'mgr-bbbb-1111-2222-333333333333';
  const INACTIVE_MGR_ID = 'mgr-cccc-inactive-333333333333';
  const PROJ_A_ID = 'proj-aaaa-1111-2222-333333333333';
  const PROJ_B_ID = 'proj-bbbb-1111-2222-333333333333';

  const mockEmployeeRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
  };

  const mockAssignmentRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockProjectRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const mockClientProjectRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmployeeRepo.find.mockResolvedValue([]);
    mockProjectRepo.find.mockResolvedValue([]);
    mockClientProjectRepo.find.mockResolvedValue([]);
    mockAssignmentRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(Department), useValue: {} },
        { provide: getRepositoryToken(Branch), useValue: {} },
        { provide: getRepositoryToken(AttendanceShift), useValue: {} },
        { provide: getRepositoryToken(UserRole), useValue: { createQueryBuilder: jest.fn().mockReturnValue({ innerJoin: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) }) } },
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(ResignationRequest), useValue: {} },
        { provide: getRepositoryToken(WorkflowAssignment), useValue: {} },
        { provide: getRepositoryToken(Timesheet), useValue: {} },
        { provide: getRepositoryToken(Timeslip), useValue: {} },
        { provide: getRepositoryToken(EmployeeProjectAssignment), useValue: mockAssignmentRepo },
        { provide: getRepositoryToken(Project), useValue: mockProjectRepo },
        { provide: getRepositoryToken(ClientProject), useValue: mockClientProjectRepo },
        { provide: getRepositoryToken(ProjectMember), useValue: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(ClientProjectMember), useValue: { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(), save: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: UsersService, useValue: {} },
        { provide: EntityManager, useValue: {} },
        { provide: LeaveService, useValue: {} },
        { provide: WfhService, useValue: {} },
        { provide: StorageService, useValue: { getSignedUrl: jest.fn().mockResolvedValue('https://signed.url') } },
        { provide: MailService, useValue: {} },
        { provide: OrganizationTimezoneService, useValue: {} },
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
  });

  describe('Part 1-4: Project Assignment and Multi-Manager Validation', () => {
    it('1. Employee can have one project + one manager', async () => {
      mockEmployeeRepo.findOne.mockImplementation(({ where }) => {
        if (where.id === EMP_ID) return Promise.resolve({ id: EMP_ID, organizationId: ORG_ID, status: 'active' });
        if (where.id === MGR_A_ID) return Promise.resolve({ id: MGR_A_ID, organizationId: ORG_ID, firstName: 'Amit', lastName: 'Kumar', status: 'active' });
        return Promise.resolve(null);
      });
      mockProjectRepo.findOne.mockResolvedValue({ id: PROJ_A_ID, organizationId: ORG_ID, name: 'Project Alpha' });
      mockAssignmentRepo.findOne.mockResolvedValue(null);
      mockAssignmentRepo.create.mockReturnValue({ id: 'assign-1', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_A_ID, managerId: MGR_A_ID, projectSource: 'internal' });
      mockAssignmentRepo.save.mockResolvedValue({ id: 'assign-1' });
      mockAssignmentRepo.find.mockResolvedValue([
        { id: 'assign-1', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_A_ID, managerId: MGR_A_ID, projectSource: 'internal', role: 'member', createdAt: new Date(), updatedAt: new Date() },
      ]);
      mockEmployeeRepo.find.mockResolvedValue([
        { id: MGR_A_ID, firstName: 'Amit', lastName: 'Kumar', status: 'active' },
      ]);
      mockProjectRepo.find.mockResolvedValue([{ id: PROJ_A_ID, name: 'Project Alpha', status: 'active' }]);
      mockClientProjectRepo.find.mockResolvedValue([]);

      const result = await service.assignProject(ORG_ID, EMP_ID, {
        projectId: PROJ_A_ID,
        projectSource: 'internal',
        managerId: MGR_A_ID,
      });

      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe(PROJ_A_ID);
      expect(result[0].project.name).toBe('Project Alpha');
      expect(result[0].manager.id).toBe(MGR_A_ID);
      expect(result[0].manager.firstName).toBe('Amit');
    });

    it('2. Employee can have multiple projects + different managers', async () => {
      mockEmployeeRepo.findOne.mockImplementation(({ where }) => {
        if (where.id === EMP_ID) return Promise.resolve({ id: EMP_ID, organizationId: ORG_ID, status: 'active' });
        if (where.id === MGR_B_ID) return Promise.resolve({ id: MGR_B_ID, organizationId: ORG_ID, firstName: 'Priya', lastName: 'Singh', status: 'active' });
        return Promise.resolve(null);
      });
      mockProjectRepo.findOne.mockResolvedValue({ id: PROJ_B_ID, organizationId: ORG_ID, name: 'Project Beta' });
      mockAssignmentRepo.findOne.mockResolvedValue(null);
      mockAssignmentRepo.create.mockReturnValue({ id: 'assign-2', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_B_ID, managerId: MGR_B_ID, projectSource: 'internal' });
      mockAssignmentRepo.save.mockResolvedValue({ id: 'assign-2' });
      mockAssignmentRepo.find.mockResolvedValue([
        { id: 'assign-1', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_A_ID, managerId: MGR_A_ID, projectSource: 'internal', role: 'developer' },
        { id: 'assign-2', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_B_ID, managerId: MGR_B_ID, projectSource: 'internal', role: 'lead' },
      ]);
      mockEmployeeRepo.find.mockResolvedValue([
        { id: MGR_A_ID, firstName: 'Amit', lastName: 'Kumar', status: 'active' },
        { id: MGR_B_ID, firstName: 'Priya', lastName: 'Singh', status: 'active' },
      ]);
      mockProjectRepo.find.mockResolvedValue([
        { id: PROJ_A_ID, name: 'Project Alpha', status: 'active' },
        { id: PROJ_B_ID, name: 'Project Beta', status: 'active' },
      ]);
      mockClientProjectRepo.find.mockResolvedValue([]);

      const result = await service.assignProject(ORG_ID, EMP_ID, {
        projectId: PROJ_B_ID,
        projectSource: 'internal',
        managerId: MGR_B_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].manager.firstName).toBe('Amit');
      expect(result[1].manager.firstName).toBe('Priya');
    });

    it('4. Duplicate employee/project assignment is rejected', async () => {
      mockEmployeeRepo.findOne.mockImplementation(({ where }) => {
        if (where.id === EMP_ID) return Promise.resolve({ id: EMP_ID, organizationId: ORG_ID, status: 'active' });
        if (where.id === MGR_A_ID) return Promise.resolve({ id: MGR_A_ID, organizationId: ORG_ID, firstName: 'Amit', status: 'active' });
        return Promise.resolve(null);
      });
      mockProjectRepo.findOne.mockResolvedValue({ id: PROJ_A_ID, organizationId: ORG_ID, name: 'Project Alpha' });
      mockAssignmentRepo.findOne.mockResolvedValue({ id: 'existing-assignment' });

      await expect(
        service.assignProject(ORG_ID, EMP_ID, {
          projectId: PROJ_A_ID,
          projectSource: 'internal',
          managerId: MGR_A_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('5. Invalid employee is rejected', async () => {
      mockEmployeeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignProject(ORG_ID, 'non-existent-emp', {
          projectId: PROJ_A_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('6. Invalid project is rejected', async () => {
      mockEmployeeRepo.findOne.mockResolvedValue({ id: EMP_ID, organizationId: ORG_ID });
      mockProjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.assignProject(ORG_ID, EMP_ID, {
          projectId: 'non-existent-proj',
          projectSource: 'internal',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. Inactive manager cannot be assigned to a new assignment', async () => {
      mockEmployeeRepo.findOne.mockImplementation(({ where }) => {
        if (where.id === EMP_ID) return Promise.resolve({ id: EMP_ID, organizationId: ORG_ID, status: 'active' });
        if (where.id === INACTIVE_MGR_ID) return Promise.resolve({ id: INACTIVE_MGR_ID, organizationId: ORG_ID, firstName: 'Inactive', lastName: 'User', status: 'inactive' });
        return Promise.resolve(null);
      });
      mockProjectRepo.findOne.mockResolvedValue({ id: PROJ_A_ID, organizationId: ORG_ID, name: 'Project Alpha' });

      await expect(
        service.assignProject(ORG_ID, EMP_ID, {
          projectId: PROJ_A_ID,
          managerId: INACTIVE_MGR_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('8. Removing one assignment does not remove other assignments', async () => {
      mockAssignmentRepo.findOne.mockResolvedValue({ id: 'assign-1', organizationId: ORG_ID, employeeId: EMP_ID });
      mockAssignmentRepo.remove.mockResolvedValue(undefined);

      const res = await service.removeProjectAssignment(ORG_ID, EMP_ID, 'assign-1');
      expect(res.success).toBe(true);
      expect(mockAssignmentRepo.remove).toHaveBeenCalled();
    });
  });

  describe('Part 7-14: Employee Status Filtering & Deactivation Behavior', () => {
    it('9. Active employees are queried by default when status is not passed', async () => {
      mockEmployeeRepo.find.mockResolvedValue([
        { id: EMP_ID, organizationId: ORG_ID, firstName: 'Rahul', status: 'active' },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);

      const result = await service.findAll(ORG_ID);
      expect(mockEmployeeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID, status: 'active' }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('12. Inactive employees returned when explicitly requested with status=inactive', async () => {
      mockEmployeeRepo.find.mockResolvedValue([
        { id: 'emp-inactive', organizationId: ORG_ID, firstName: 'Inactive', status: 'inactive' },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);

      const result = await service.findAll(ORG_ID, 'inactive');
      expect(mockEmployeeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID, status: 'inactive' }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('15. Deactivated manager preserves historical relationship with isActive=false', async () => {
      const empList: any[] = [
        { id: EMP_ID, organizationId: ORG_ID, firstName: 'Rahul', status: 'active' },
      ];
      mockAssignmentRepo.find.mockResolvedValue([
        { id: 'assign-old', organizationId: ORG_ID, employeeId: EMP_ID, projectId: PROJ_A_ID, managerId: INACTIVE_MGR_ID, projectSource: 'internal', role: 'developer' },
      ]);
      mockProjectRepo.find.mockResolvedValue([{ id: PROJ_A_ID, name: 'Legacy Project', status: 'active' }]);
      mockClientProjectRepo.find.mockResolvedValue([]);
      mockEmployeeRepo.find.mockResolvedValue([
        { id: INACTIVE_MGR_ID, firstName: 'Former', lastName: 'Manager', status: 'inactive' },
      ]);

      await service.attachProjectAssignmentsAndManagers(empList, ORG_ID);

      expect(empList[0].managers).toHaveLength(1);
      expect(empList[0].managers[0].firstName).toBe('Former');
      expect(empList[0].managers[0].isActive).toBe(false);
      expect(empList[0].managers[0].status).toBe('inactive');
    });
  });
});
