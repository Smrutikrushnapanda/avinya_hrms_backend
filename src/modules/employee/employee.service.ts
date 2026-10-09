import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  OnModuleInit,
  ForbiddenException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  EntityManager,
  MoreThan,
  QueryFailedError,
  In,
  Not,
} from 'typeorm';
import { Cache } from 'cache-manager';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateUserDto } from '../auth-core/dto/create-user.dto';
import { Role } from '../auth-core/entities/role.entity';
import { RoleType } from '../auth-core/enums/role-type.enum';
import { UsersService } from '../auth-core/services/users.service';
import { User } from '../auth-core/entities/user.entity';
import { LeaveService } from '../leave/leave.service';
import { WfhService } from '../wfh/wfh.service';
import * as bcrypt from 'bcrypt';
import { Branch } from '../attendance/entities/branch.entity';
import { AttendanceShift } from '../attendance/entities/attendance-shift.entity';
import { StorageService } from '../attendance/storage.service';
import { ResignationRequest } from '../resignation/entities/resignation-request.entity';
import { WorkflowAssignment } from '../workflow/entities/workflow-assignment.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { Timeslip } from '../workflow/timeslip/entities/timeslip.entity';
import { MailService } from '../mail/mail.service';
import { DateTime } from 'luxon';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';
import { getFullName } from '../../shared/name.util';
import {
  EmployeeProjectAssignment,
  EmployeeProjectSource,
} from './entities/employee-project-assignment.entity';
import { Project } from '../project/entities/project.entity';
import { ClientProject } from '../clients/entities/project.entity';
import { ProjectMember } from '../project/entities/project-member.entity';
import { ClientProjectMember } from '../clients/entities/client-project-member.entity';
import { EmployeeAsset, AssetStatus } from './entities/employee-asset.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import {
  EmployeeDocumentTemplate,
  DocumentTemplateType,
} from './entities/employee-document-template.entity';
import {
  EmployeeSettlement,
  SettlementStatus,
} from './entities/employee-settlement.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { OrganizationSettings } from '../auth-core/entities/organization-settings.entity';
import { SalaryStructure } from '../payroll/entities/salary-structure.entity';
import { PayrollSettings } from '../payroll/entities/payroll-settings.entity';
import { LeaveBalance } from '../leave/entities/leave-balance.entity';
import {
  CreateEmployeeAssetDto,
  UpdateEmployeeAssetDto,
  ReturnAssetDto,
} from './dto/employee-asset.dto';
import { CreateEmployeeDocumentDto } from './dto/employee-document.dto';
import {
  CreateDocumentTemplateDto,
  UpdateDocumentTemplateDto,
  PreviewLetterDto,
} from './dto/employee-document-template.dto';
import {
  SaveSettlementDto,
  AssignManagerDto,
} from './dto/employee-settlement.dto';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Cache key constants
const CACHE_KEYS = {
  EMPLOYEES: 'employees',
  EMPLOYEE: 'employee',
  DASHBOARD_STATS: 'dashboard-stats',
  ANALYTICS: 'employee-analytics',
  BIRTHDAYS: 'employee-birthdays',
};

@Injectable()
export class EmployeeService implements OnModuleInit {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

    @InjectRepository(AttendanceShift)
    private readonly shiftRepository: Repository<AttendanceShift>,

    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ResignationRequest)
    private readonly resignationRepository: Repository<ResignationRequest>,

    @InjectRepository(WorkflowAssignment)
    private readonly workflowAssignmentRepository: Repository<WorkflowAssignment>,

    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,

    @InjectRepository(Timeslip)
    private readonly timeslipRepository: Repository<Timeslip>,

    @InjectRepository(EmployeeProjectAssignment)
    private readonly assignmentRepository: Repository<EmployeeProjectAssignment>,

    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,

    @InjectRepository(ClientProject)
    private readonly clientProjectRepository: Repository<ClientProject>,

    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,

    @InjectRepository(ClientProjectMember)
    private readonly clientProjectMemberRepository: Repository<ClientProjectMember>,

    @InjectRepository(EmployeeAsset)
    private readonly assetRepository: Repository<EmployeeAsset>,

    @InjectRepository(EmployeeDocument)
    private readonly documentRepository: Repository<EmployeeDocument>,

    @InjectRepository(EmployeeDocumentTemplate)
    private readonly templateRepository: Repository<EmployeeDocumentTemplate>,

    @InjectRepository(EmployeeSettlement)
    private readonly settlementRepository: Repository<EmployeeSettlement>,

    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,

    @InjectRepository(OrganizationSettings)
    private readonly orgSettingsRepository: Repository<OrganizationSettings>,

    @InjectRepository(SalaryStructure)
    private readonly salaryStructureRepository: Repository<SalaryStructure>,

    @InjectRepository(PayrollSettings)
    private readonly payrollSettingsRepository: Repository<PayrollSettings>,

    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly userService: UsersService,
    private readonly entityManager: EntityManager,
    private readonly leaveService: LeaveService,
    private readonly wfhService: WfhService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
    private readonly timezoneService: OrganizationTimezoneService,
  ) {}

  async onModuleInit() {
    try {
      const [{ schema }] = await this.employeeRepository.query(
        'SELECT current_schema() AS schema',
      );
      await this.employeeRepository.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."employee_project_assignments" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "organization_id" uuid NOT NULL,
          "employee_id" uuid NOT NULL,
          "project_id" uuid NOT NULL,
          "project_source" varchar(20) NOT NULL DEFAULT 'internal',
          "manager_id" uuid NULL,
          "manager_type" varchar(20) NOT NULL DEFAULT 'SECONDARY',
          "role" varchar(50) NOT NULL DEFAULT 'member',
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        );
      `);
      await this.employeeRepository.query(`
        ALTER TABLE "${schema}"."employee_project_assignments"
        ADD COLUMN IF NOT EXISTS "manager_type" varchar(20) NOT NULL DEFAULT 'SECONDARY';
      `);
      await this.employeeRepository.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_employee_project_assignments_unique"
        ON "${schema}"."employee_project_assignments" ("organization_id", "employee_id", "project_id", "project_source");
      `);

      // Employee Assets table
      await this.employeeRepository.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."employee_assets" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "organization_id" uuid NOT NULL,
          "employee_id" uuid NOT NULL,
          "asset_type" varchar(100) NOT NULL,
          "asset_name" varchar(255) NOT NULL,
          "asset_id" varchar(100) NOT NULL,
          "serial_number" varchar(100) NULL,
          "brand" varchar(100) NULL,
          "model" varchar(100) NULL,
          "condition" varchar(100) NULL,
          "issue_date" date NOT NULL,
          "expected_return_date" date NULL,
          "actual_return_date" date NULL,
          "status" varchar(50) NOT NULL DEFAULT 'ASSIGNED',
          "is_return_required" boolean NOT NULL DEFAULT true,
          "notes" text NULL,
          "created_by" uuid NULL,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        );
      `);

      // Employee Documents table
      await this.employeeRepository.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."employee_documents" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "organization_id" uuid NOT NULL,
          "employee_id" uuid NOT NULL,
          "document_name" varchar(255) NOT NULL,
          "document_category" varchar(100) NOT NULL DEFAULT 'Other',
          "file_url" text NOT NULL,
          "file_size" varchar(50) NULL,
          "mime_type" varchar(100) NULL,
          "remarks" text NULL,
          "uploaded_by" uuid NULL,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        );
      `);

      // Employee Settlements table
      await this.employeeRepository.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."employee_settlements" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "organization_id" uuid NOT NULL,
          "employee_id" uuid NOT NULL,
          "resignation_request_id" uuid NULL,
          "resignation_date" date NULL,
          "notice_period_days" int NOT NULL DEFAULT 0,
          "last_working_date" date NULL,
          "reason_for_leaving" text NULL,
          "salary_due" decimal(12,2) NOT NULL DEFAULT 0,
          "pending_salary" decimal(12,2) NOT NULL DEFAULT 0,
          "leave_encashment_days" decimal(6,2) NOT NULL DEFAULT 0,
          "leave_encashment_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "bonus_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "incentive_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "gratuity_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "other_payable_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "total_earnings" decimal(12,2) NOT NULL DEFAULT 0,
          "notice_period_recovery_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "loan_recovery_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "asset_deduction_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "other_deductions_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "total_deductions" decimal(12,2) NOT NULL DEFAULT 0,
          "net_settlement_amount" decimal(12,2) NOT NULL DEFAULT 0,
          "deductions_remarks" text NULL,
          "status" varchar(50) NOT NULL DEFAULT 'DRAFT',
          "prepared_by" varchar(255) NULL,
          "hr_approval_name" varchar(255) NULL,
          "finance_approval_name" varchar(255) NULL,
          "approval_date" date NULL,
          "employee_declaration_acknowledged" boolean NOT NULL DEFAULT false,
          "remarks" text NULL,
          "created_by" uuid NULL,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        );
      `);

      // Employee Document Templates table
      await this.employeeRepository.query(`
        CREATE TABLE IF NOT EXISTS "${schema}"."employee_document_templates" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "organization_id" uuid NOT NULL,
          "template_type" varchar(50) NOT NULL,
          "template_name" varchar(255) NOT NULL,
          "content" text NOT NULL,
          "is_active" boolean NOT NULL DEFAULT true,
          "created_by" uuid NULL,
          "updated_by" uuid NULL,
          "created_at" timestamptz NOT NULL DEFAULT now(),
          "updated_at" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "idx_emp_doc_templates_org_type" ON "${schema}"."employee_document_templates" ("organization_id", "template_type");
      `);

      // Ensure columns and allow nulls for unconfigured numeric values in employee_settlements
      const settlementAlterQueries = [
        `ALTER TABLE "${schema}"."employee_settlements" ADD COLUMN IF NOT EXISTS "final_settlement_amount" decimal(12,2) NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ADD COLUMN IF NOT EXISTS "net_settlement_amount" decimal(12,2) NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ADD COLUMN IF NOT EXISTS "gratuity_amount" decimal(12,2) NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "salary_due" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "pending_salary" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "leave_encashment_days" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "leave_encashment_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "bonus_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "incentive_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "other_payable_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "total_earnings" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "notice_period_recovery_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "loan_recovery_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "asset_deduction_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "other_deductions_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "total_deductions" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "net_settlement_amount" DROP NOT NULL;`,
        `ALTER TABLE "${schema}"."employee_settlements" ALTER COLUMN "final_settlement_amount" DROP NOT NULL;`,
      ];

      for (const q of settlementAlterQueries) {
        try {
          await this.employeeRepository.query(q);
        } catch (alterErr) {
          // ignore already-altered column errors
        }
      }
    } catch (e) {
      console.error('Failed to initialize schema extensions:', e);
    }
  }

  async create(dto: CreateEmployeeDto) {
    try {
      // If loginUserName is not provided, default to work email (before @)
      let loginUserName = dto.loginUserName?.trim();
      const { loginPassword, roleId, ...employeePayload } = dto;

      if (!loginPassword?.trim()) {
        throw new BadRequestException('loginPassword is required');
      }

      // Default username to work email prefix if not provided
      if (!loginUserName) {
        loginUserName = dto.workEmail.split('@')[0].toLowerCase();
      }

      await this.ensureShiftBelongsToOrganization(
        dto.organizationId,
        dto.shiftId ?? null,
      );

      if (dto.reportingTo) {
        const validation = await this.validateManagerAssignment({
          organizationId: dto.organizationId,
          reportingTo: dto.reportingTo,
        });
        if (!validation.isValid) {
          throw new BadRequestException(validation.errors.join('; '));
        }
      }

      const selectedRole = await this.resolveRoleForEmployee(
        dto.organizationId,
        roleId,
      );

      const normalizedWorkEmail = dto.workEmail.trim().toLowerCase();
      const normalizedContactNumber = dto.contactNumber?.trim() || undefined;

      const [
        existingUserByEmail,
        existingUserByUserName,
        existingUserByMobile,
      ] = await Promise.all([
        this.userRepository.findOne({
          where: { email: normalizedWorkEmail },
        }),
        this.userRepository.findOne({
          where: { userName: loginUserName },
        }),
        normalizedContactNumber
          ? this.userRepository.findOne({
              where: { mobileNumber: normalizedContactNumber },
            })
          : Promise.resolve(null),
      ]);

      const matchedUsers = [
        existingUserByEmail,
        existingUserByUserName,
        existingUserByMobile,
      ].filter(Boolean) as User[];
      const uniqueMatchedUsers = Array.from(
        new Map(matchedUsers.map((user) => [user.id, user])).values(),
      );

      if (uniqueMatchedUsers.length > 1) {
        if (
          existingUserByEmail &&
          uniqueMatchedUsers.some((user) => user.id !== existingUserByEmail.id)
        ) {
          throw new ConflictException(
            'Work email is already linked to another user',
          );
        }
        if (
          existingUserByUserName &&
          uniqueMatchedUsers.some(
            (user) => user.id !== existingUserByUserName.id,
          )
        ) {
          throw new ConflictException('Username already in use');
        }
        if (
          existingUserByMobile &&
          uniqueMatchedUsers.some((user) => user.id !== existingUserByMobile.id)
        ) {
          throw new ConflictException(
            'Contact number is already linked to another user',
          );
        }
      }

      const existingUser = uniqueMatchedUsers[0] ?? null;
      const matchedAnotherOrganization =
        existingUser?.organizationId &&
        existingUser.organizationId !== dto.organizationId;

      const userDto: CreateUserDto = {
        userName: loginUserName,
        password: loginPassword,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName ?? '',
        email: normalizedWorkEmail,
        mobileNumber: normalizedContactNumber,
        dob: dto.dateOfBirth,
        gender: dto.gender,
        organizationId: dto.organizationId,
      };

      if (existingUser) {
        if (matchedAnotherOrganization) {
          if (existingUserByEmail?.id === existingUser.id) {
            throw new ConflictException(
              'Work email is already used in another organization',
            );
          }
          if (existingUserByUserName?.id === existingUser.id) {
            throw new ConflictException(
              'Username is already used in another organization',
            );
          }
          if (existingUserByMobile?.id === existingUser.id) {
            throw new ConflictException(
              'Contact number is already used in another organization',
            );
          }
          throw new ConflictException(
            'User details are already used in another organization',
          );
        }

        const existingEmployee = await this.employeeRepository.findOne({
          where: { userId: existingUser.id },
        });

        if (existingEmployee) {
          if (existingEmployee.organizationId !== dto.organizationId) {
            throw new ConflictException(
              'This user is already linked to an employee in another organization',
            );
          }
          throw new ConflictException(
            `Employee already exists for this user (employee code: ${existingEmployee.employeeCode})`,
          );
        }

        existingUser.userName = loginUserName;
        existingUser.email = normalizedWorkEmail;
        existingUser.mobileNumber = normalizedContactNumber;
        existingUser.password = await bcrypt.hash(loginPassword, 12);
        existingUser.mustChangePassword = true;
        existingUser.organizationId = dto.organizationId;
        // The matched row can be a placeholder account (e.g. the org's admin
        // user created before any employees existed) whose name has nothing to
        // do with this employee — without this, /auth/profile keeps showing
        // that stale name (e.g. "Admin") instead of the employee's real one.
        existingUser.firstName = dto.firstName;
        existingUser.middleName = dto.middleName ?? '';
        existingUser.lastName = dto.lastName ?? '';
        if (dto.dateOfBirth) existingUser.dob = new Date(dto.dateOfBirth);
        if (dto.gender) existingUser.gender = dto.gender;
        await this.userRepository.save(existingUser);

        await this.setUserPrimaryRole(existingUser.id, selectedRole);

        const employee = this.employeeRepository.create({
          ...employeePayload,
          userId: existingUser.id,
        });

        const savedEmployee = await this.employeeRepository.save(employee);
        if (savedEmployee.employmentType) {
          await this.leaveService.applyTemplatesToUser(
            savedEmployee.userId,
            savedEmployee.organizationId,
            savedEmployee.employmentType,
          );
          await this.wfhService.applyTemplatesToUser(
            savedEmployee.userId,
            savedEmployee.organizationId,
            savedEmployee.employmentType,
          );
        }

        // Invalidate cache after creating employee
        await this.invalidateEmployeeCache(dto.organizationId);

        await this.sendCredentialsEmailSafely({
          organizationId: dto.organizationId,
          employeeEmail: dto.workEmail,
          employeeName:
            getFullName(dto.firstName, dto.middleName, dto.lastName) ||
            dto.firstName,
          userName: loginUserName,
          password: loginPassword,
          reason: 'created',
        });

        return this.findOne(savedEmployee.id);
      }

      const createdUser = await this.userService.create(userDto);
      await this.setUserPrimaryRole(createdUser.id, selectedRole);

      const employee = this.employeeRepository.create({
        ...employeePayload,
        userId: createdUser.id,
      });

      const savedEmployee = await this.employeeRepository.save(employee);
      if (savedEmployee.employmentType) {
        await this.leaveService.applyTemplatesToUser(
          savedEmployee.userId,
          savedEmployee.organizationId,
          savedEmployee.employmentType,
        );
        await this.wfhService.applyTemplatesToUser(
          savedEmployee.userId,
          savedEmployee.organizationId,
          savedEmployee.employmentType,
        );
      }

      // Invalidate cache after creating employee
      await this.invalidateEmployeeCache(dto.organizationId);

      await this.sendCredentialsEmailSafely({
        organizationId: dto.organizationId,
        employeeEmail: dto.workEmail,
        employeeName:
          getFullName(dto.firstName, dto.middleName, dto.lastName) ||
          dto.firstName,
        userName: loginUserName,
        password: loginPassword,
        reason: 'created',
      });

      return this.findOne(savedEmployee.id);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).code === '23505'
      ) {
        throw new ConflictException(
          'Employee already exists with provided unique details',
        );
      }
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<any | null> {
    const employee = await this.employeeRepository.findOne({
      where: { userId },
      relations: [
        'user',
        'organization',
        'department',
        'designation',
        'manager',
        'branch',
        'shift',
      ],
    });
    if (!employee) return null;

    const photoUrl = await this.signIfNeeded(this.getProfilePhotoKey(employee));
    const aadharPhotoUrl = await this.signIfNeeded(employee.aadharPhotoUrl);
    const panCardPhotoUrl = await this.signIfNeeded(employee.panCardPhotoUrl);
    const passportPhotoUrl = await this.signIfNeeded(employee.passportPhotoUrl);
    const managerPhotoUrl = await this.signIfNeeded(
      this.getProfilePhotoKey(employee.manager as any),
    );
    const userRoles = await this.getUserRolesMap([employee.userId]);
    const roles = userRoles.get(employee.userId) || [];

    const result = {
      ...employee,
      roles,
      roleId: roles[0]?.id ?? null,
      primaryRole: roles[0]?.roleName ?? null,
      photoUrl,
      aadharPhotoUrl: aadharPhotoUrl ?? employee.aadharPhotoUrl ?? null,
      panCardPhotoUrl: panCardPhotoUrl ?? employee.panCardPhotoUrl ?? null,
      passportPhotoUrl: passportPhotoUrl ?? employee.passportPhotoUrl ?? null,
      manager: employee.manager
        ? { ...employee.manager, photoUrl: managerPhotoUrl }
        : employee.manager,
    };

    await this.attachProjectAssignmentsAndManagers(
      [result],
      employee.organizationId,
    );

    return result;
  }

  findAll(organizationId: string, status?: string) {
    const normalizedStatus = status ? status.toLowerCase() : 'active';
    const cacheKey = `${CACHE_KEYS.EMPLOYEES}:${organizationId}:${normalizedStatus}`;

    return this.cacheManager.get(cacheKey).then(async (cached) => {
      if (cached) {
        console.log('📦 Returning cached employees for org:', organizationId);
        return cached;
      }

      const whereClause: any = { organizationId };
      if (normalizedStatus !== 'all') {
        whereClause.status = normalizedStatus;
      }

      const emps = await this.employeeRepository.find({
        where: whereClause,
        relations: [
          'department',
          'designation',
          'manager',
          'user',
          'branch',
          'shift',
        ],
        order: { firstName: 'ASC' },
      });

      // Use Promise.all for parallel photo signing
      const employees = await Promise.all(
        emps.map((e) => this.addSignedProfilePhoto(e)),
      );

      // Attach project assignments and managers
      await this.attachProjectAssignmentsAndManagers(employees, organizationId);

      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, employees, 300);
      console.log('💾 Cached employees for org:', organizationId);

      return employees;
    });
  }

  async findOne(id: string) {
    const cacheKey = `${CACHE_KEYS.EMPLOYEE}:${id}`;

    // Check cache first
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      console.log('📦 Returning cached employee:', id);
      return cached;
    }

    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: [
        'department',
        'designation',
        'manager',
        'user',
        'branch',
        'shift',
      ],
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    // Parallel photo signing for better performance
    const [photoUrl, managerPhotoUrl, userRoles] = await Promise.all([
      this.signIfNeeded(this.getProfilePhotoKey(employee)),
      this.signIfNeeded(this.getProfilePhotoKey(employee.manager as any)),
      this.getUserRolesMap([employee.userId]),
    ]);

    const roles = userRoles.get(employee.userId) || [];

    const result = {
      ...(employee as any),
      userName: (employee as any)?.user?.userName,
      roles,
      roleId: roles[0]?.id ?? null,
      primaryRole: roles[0]?.roleName ?? null,
      photoUrl,
      manager: employee.manager
        ? { ...employee.manager, photoUrl: managerPhotoUrl }
        : employee.manager,
    };

    await this.attachProjectAssignmentsAndManagers(
      [result],
      employee.organizationId,
    );

    // Cache for 10 minutes
    await this.cacheManager.set(cacheKey, result, 600);

    return result;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const { loginUserName, loginPassword, roleId, ...employeeUpdate } =
      dto as any;

    if (Object.prototype.hasOwnProperty.call(employeeUpdate, 'shiftId')) {
      const existingEmployee = await this.findOne(id);
      await this.ensureShiftBelongsToOrganization(
        existingEmployee.organizationId,
        employeeUpdate.shiftId ?? null,
      );
    }

    if (Object.prototype.hasOwnProperty.call(employeeUpdate, 'reportingTo')) {
      const existingEmployee = await this.findOne(id);
      if (employeeUpdate.reportingTo) {
        const validation = await this.validateManagerAssignment({
          organizationId: existingEmployee.organizationId,
          employeeId: id,
          reportingTo: employeeUpdate.reportingTo,
        });
        if (!validation.isValid) {
          throw new BadRequestException(validation.errors.join('; '));
        }
      }
    }

    // FK isolation: validate departmentId, branchId, shiftId, reportingTo
    // belong to the same organization as the employee being updated
    if (dto.departmentId || dto.branchId || dto.shiftId || dto.reportingTo) {
      const existingEmployee = await this.findOne(id);
      const orgId = existingEmployee.organizationId;

      if (dto.departmentId) {
        const dept = await this.departmentRepository.findOne({
          where: { id: dto.departmentId, organizationId: orgId },
        });
        if (!dept) {
          throw new BadRequestException(
            'Department does not belong to your organization',
          );
        }
      }

      if (dto.branchId) {
        const branch = await this.branchRepository.findOne({
          where: { id: dto.branchId, organizationId: orgId },
        });
        if (!branch) {
          throw new BadRequestException(
            'Branch does not belong to your organization',
          );
        }
      }

      if (dto.shiftId) {
        await this.ensureShiftBelongsToOrganization(orgId, dto.shiftId);
      }

      if (dto.reportingTo) {
        const manager = await this.employeeRepository.findOne({
          where: { id: dto.reportingTo, organizationId: orgId },
        });
        if (!manager) {
          throw new BadRequestException(
            'Manager does not belong to your organization',
          );
        }
      }
    }

    if (Object.keys(employeeUpdate).length > 0) {
      await this.employeeRepository.update(id, employeeUpdate);
    }
    const employee = await this.findOne(id);

    let credentialsUpdated = false;
    let effectiveUserName = '';

    // The header/profile screens (/auth/profile) read name fields straight off
    // the `users` row, not `employees` — without syncing these, editing an
    // employee's name here would never be reflected there.
    const nameFieldsChanged = [
      'firstName',
      'middleName',
      'lastName',
      'dateOfBirth',
      'gender',
      'contactNumber',
    ].some((key) => Object.prototype.hasOwnProperty.call(employeeUpdate, key));

    const statusChanged = Object.prototype.hasOwnProperty.call(
      employeeUpdate,
      'status',
    );

    if (loginUserName || loginPassword || nameFieldsChanged || statusChanged) {
      const user = await this.userRepository.findOne({
        where: { id: employee.userId },
      });
      if (!user) {
        throw new NotFoundException(`User for employee ${id} not found`);
      }

      if (statusChanged && employeeUpdate.status) {
        user.isActive = employeeUpdate.status.toLowerCase() === 'active';
      }

      if (loginUserName) {
        const normalizedUserName = String(loginUserName).trim();
        if (!normalizedUserName) {
          throw new BadRequestException('loginUserName cannot be empty');
        }
        const existing = await this.userRepository.findOne({
          where: { userName: normalizedUserName },
        });
        if (existing && existing.id !== user.id) {
          throw new ConflictException('Username already in use');
        }
        user.userName = normalizedUserName;
        credentialsUpdated = true;
      }

      if (loginPassword) {
        user.password = await bcrypt.hash(loginPassword, 12);
        // NOTE: deliberately NOT setting mustChangePassword here — when an
        // admin edits an existing employee and sets a new password, the
        // employee must be able to log straight in with it. The forced
        // password-change flag is only meaningful for freshly created
        // accounts (see the create flow), not for admin-initiated resets.
        credentialsUpdated = true;
      }

      if (nameFieldsChanged) {
        if (employeeUpdate.firstName !== undefined) {
          user.firstName = employeeUpdate.firstName;
        }
        if (employeeUpdate.middleName !== undefined) {
          user.middleName = employeeUpdate.middleName ?? '';
        }
        if (employeeUpdate.lastName !== undefined) {
          user.lastName = employeeUpdate.lastName ?? '';
        }
        if (employeeUpdate.dateOfBirth) {
          user.dob = new Date(employeeUpdate.dateOfBirth);
        }
        if (employeeUpdate.gender) {
          user.gender = employeeUpdate.gender;
        }
        if (employeeUpdate.contactNumber !== undefined) {
          user.mobileNumber = employeeUpdate.contactNumber
            ? String(employeeUpdate.contactNumber).trim()
            : null;
        }
      }

      await this.userRepository.save(user);
      effectiveUserName = user.userName;
    } else {
      effectiveUserName = employee?.userName || '';
    }

    if (roleId) {
      const selectedRole = await this.resolveRoleForEmployee(
        employee.organizationId,
        roleId,
      );
      await this.setUserPrimaryRole(employee.userId, selectedRole);
    }

    // Invalidate cache after update
    await this.invalidateEmployeeCache(employee.organizationId, id);

    if (credentialsUpdated && loginPassword) {
      const employeeName =
        getFullName(
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ) ||
        employee.firstName ||
        'Employee';

      await this.sendCredentialsEmailSafely({
        organizationId: employee.organizationId,
        employeeEmail: employee.workEmail,
        employeeName,
        userName: effectiveUserName,
        password: loginPassword,
        reason: 'password_reset',
      });
    }

    return this.findOne(id);
  }

  private async sendCredentialsEmailSafely(params: {
    organizationId: string;
    employeeEmail?: string | null;
    employeeName: string;
    userName: string;
    password: string;
    reason: 'created' | 'password_reset';
  }): Promise<void> {
    if (!params.employeeEmail?.trim()) {
      return;
    }

    try {
      await this.mailService.sendEmployeeCredentials({
        organizationId: params.organizationId,
        employeeEmail: params.employeeEmail.trim(),
        employeeName: params.employeeName,
        userName: params.userName,
        password: params.password,
        reason: params.reason,
      });
    } catch {
      // Never fail core employee create/update flow if email delivery fails.
    }
  }

  async remove(id: string) {
    const employee = await this.employeeRepository.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    try {
      // Find employees who report to this employee
      const reportingEmployees = await this.employeeRepository.find({
        where: { reportingTo: id },
      });

      // Set their manager to null and save them
      for (const reportingEmployee of reportingEmployees) {
        reportingEmployee.reportingTo = null;
        await this.employeeRepository.save(reportingEmployee);
      }

      // Clean up related records before deleting the employee

      // 1. Delete resignation requests for this employee
      await this.resignationRepository.delete({ employeeId: id });
      await this.resignationRepository.delete({
        employeeUserId: employee.userId,
      });

      // 2. Delete workflow assignments for this employee
      await this.workflowAssignmentRepository.delete({ employeeId: id });
      // Also clear approver_id where this employee is set as approver
      await this.workflowAssignmentRepository
        .createQueryBuilder()
        .update(WorkflowAssignment)
        .set({ approverId: null })
        .where('approverId = :employeeId', { employeeId: id })
        .execute();

      // 3. Delete timesheets for this employee
      await this.timesheetRepository.delete({ employeeId: id });

      // 4. Delete timeslips for this employee (use query builder since no direct employeeId column)
      await this.timeslipRepository
        .createQueryBuilder()
        .delete()
        .from(Timeslip)
        .where('employee_id = :employeeId', { employeeId: id })
        .execute();

      // Now, it should be safe to remove the employee
      await this.employeeRepository.remove(employee);

      if (employee.userId) {
        await this.userService.remove(employee.userId);
      }

      // Invalidate cache after deletion
      await this.invalidateEmployeeCache(employee.organizationId, id);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException(
          'Cannot delete this employee because they are referenced by other records.',
        );
      }
      throw error;
    }
  }

  // --- ENHANCED DASHBOARD STATS ---
  async getDashboardStats(organizationId: string) {
    try {
      console.log(
        '🚀 Getting enhanced dashboard stats for organization:',
        organizationId,
      );

      const nowOrg = await this.timezoneService.getNow(organizationId);
      const todayStr = nowOrg.toFormat('yyyy-MM-dd');
      const lastMonthStart = nowOrg
        .minus({ months: 1 })
        .startOf('month')
        .toFormat('yyyy-MM-dd');
      const thisMonthStart = nowOrg.startOf('month').toFormat('yyyy-MM-dd');
      const thisMonthPayPeriod = nowOrg.toFormat('yyyy-MM');

      // Single consolidated query — uses only 1 connection instead of 9
      const [row] = await this.entityManager.query(
        `
        WITH
          emp_stats AS (
            SELECT
              COUNT(*) AS total_employees,
              COUNT(*) FILTER (WHERE status = 'active') AS active_employees,
              COUNT(*) FILTER (WHERE date_of_joining > $2) AS new_this_month,
              COUNT(*) FILTER (WHERE date_of_joining >= $3 AND date_of_joining < $2) AS new_last_month,
              COUNT(DISTINCT department_id) FILTER (WHERE department_id IS NOT NULL) AS dept_count,
              COUNT(DISTINCT designation_id) FILTER (WHERE designation_id IS NOT NULL) AS desig_count
            FROM employees
            WHERE organization_id = $1
          ),
          attendance_stats AS (
            SELECT
              COUNT(*) FILTER (WHERE status IN ('present', 'late')) AS present_today,
              COUNT(*) FILTER (WHERE status = 'half-day') AS half_day_today
            FROM attendance
            WHERE organization_id = $1 AND attendance_date = $4
          ),
          leave_stats AS (
            SELECT
              COUNT(*) FILTER (WHERE lr.status IN ('APPROVED', 'approved') AND lr.start_date <= $4 AND lr.end_date >= $4) AS on_leave_today,
              COUNT(*) FILTER (WHERE lr.status IN ('PENDING', 'pending')) AS pending_leaves
            FROM leave_requests lr
            JOIN users u ON u.user_id = lr.user_id
            WHERE u.organization_id = $1
          ),
          payroll_stats AS (
            SELECT
              COALESCE(SUM(net_pay), 0) AS payroll_paid
            FROM payroll_records
            WHERE organization_id = $1
              AND pay_period = $5
              AND status IN ('paid', 'PAID')
          )
        SELECT
          e.total_employees, e.active_employees, e.new_this_month, e.new_last_month,
          e.dept_count, e.desig_count,
          a.present_today, a.half_day_today,
          l.on_leave_today, l.pending_leaves,
          p.payroll_paid
        FROM emp_stats e, attendance_stats a, leave_stats l, payroll_stats p
      `,
        [
          organizationId,
          thisMonthStart,
          lastMonthStart,
          todayStr,
          thisMonthPayPeriod,
        ],
      );

      const totalEmployees = parseInt(row.total_employees) || 0;
      const activeEmployees = parseInt(row.active_employees) || 0;
      const newJoinersThisMonth = parseInt(row.new_this_month) || 0;
      const newJoinersLastMonth = parseInt(row.new_last_month) || 0;
      const presentToday = parseInt(row.present_today) || 0;
      const halfDay = parseInt(row.half_day_today) || 0;
      const onLeaveToday = parseInt(row.on_leave_today) || 0;
      const pendingLeaveRequests = parseInt(row.pending_leaves) || 0;
      const deptCount = parseInt(row.dept_count) || 0;
      const desigCount = parseInt(row.desig_count) || 0;
      const payrollDue = parseFloat(row.payroll_paid) || 0;

      const absent = Math.max(
        0,
        activeEmployees - presentToday - halfDay - onLeaveToday,
      );
      const newJoinersChange =
        newJoinersLastMonth > 0
          ? Math.round(
              ((newJoinersThisMonth - newJoinersLastMonth) /
                newJoinersLastMonth) *
                100,
            )
          : newJoinersThisMonth > 0
            ? 100
            : 0;

      const result = {
        totalEmployees: { value: totalEmployees, change: 0 },
        activeEmployees: { value: activeEmployees, change: 0 },
        presentToday: { value: presentToday, change: 0 },
        onLeaveToday: { value: onLeaveToday, change: 0 },
        pendingLeaveRequests: { value: pendingLeaveRequests, change: 0 },
        payrollDue: { value: payrollDue, change: 0 },
        newJoinersThisMonth: {
          value: newJoinersThisMonth,
          change: newJoinersChange,
        },
        departments: { value: deptCount, change: 0 },
        designations: { value: desigCount, change: 0 },
        attendanceBreakdown: {
          present: presentToday,
          halfDay: halfDay,
          absent: absent,
        },
      };

      console.log('📈 Enhanced dashboard stats:', result);
      return result;
    } catch (error) {
      console.error('❌ Error in getDashboardStats:', error);
      throw error;
    }
  }

  // --- UPCOMING BIRTHDAYS ---
  async getUpcomingBirthdays(organizationId: string, days: number = 30) {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);

    // Get all employees with birthdays
    const employees = await this.employeeRepository.find({
      where: {
        organizationId,
        status: 'active',
      },
      relations: ['department'],
      select: [
        'id',
        'firstName',
        'lastName',
        'dateOfBirth',
        'photoUrl',
        'passportPhotoUrl',
        'workEmail',
      ],
    });

    // Filter employees with birthdays in the next N days
    const upcomingBirthdays = employees
      .filter((employee) => employee.dateOfBirth)
      .map((employee) => {
        const birthDate = new Date(employee.dateOfBirth);
        const thisYear = today.getFullYear();
        const birthdayThisYear = new Date(
          thisYear,
          birthDate.getMonth(),
          birthDate.getDate(),
        );

        // If birthday already passed this year, check next year
        if (birthdayThisYear < today) {
          birthdayThisYear.setFullYear(thisYear + 1);
        }

        const daysUntil = Math.ceil(
          (birthdayThisYear.getTime() - today.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        return {
          ...employee,
          daysUntilBirthday: daysUntil,
          upcomingBirthdayDate: birthdayThisYear,
        };
      })
      .filter(
        (employee) =>
          employee.daysUntilBirthday <= days && employee.daysUntilBirthday >= 0,
      )
      .sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);

    return Promise.all(
      upcomingBirthdays.map(async (emp) => this.addSignedProfilePhoto(emp)),
    );
  }

  // --- NEW: COMPREHENSIVE EMPLOYEE SEARCH WITH FILTERS AND PAGINATION ---
  async findAllWithFilters(organizationId: string, filters: any) {
    const {
      page,
      limit,
      search,
      status,
      department,
      designation,
      joinDateFilter,
      sortBy,
      sortOrder,
      branch,
    } = filters;

    console.log('🔍 Finding employees with filters:', filters);

    // Create query builder for complex search
    let queryBuilder = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .leftJoinAndSelect('employee.manager', 'manager')
      .leftJoinAndSelect('employee.branch', 'branch')
      .leftJoinAndSelect('employee.shift', 'shift')
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.organizationId = :organizationId', { organizationId });

    // Add status filter (default to 'active' unless 'all' or explicit)
    const effectiveStatus = status ? status.toLowerCase() : 'active';
    if (effectiveStatus !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.status = :status', {
        status: effectiveStatus,
      });
    }

    // Add department filter
    if (department && department !== 'all') {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId: department },
      );
    }

    // Add designation filter
    if (designation && designation !== 'all') {
      queryBuilder = queryBuilder.andWhere(
        'employee.designationId = :designationId',
        { designationId: designation },
      );
    }

    // Add branch filter
    if (branch && branch !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.branchId = :branchId', {
        branchId: branch,
      });
    }

    // Add join date filter
    if (joinDateFilter && joinDateFilter !== 'all') {
      const now = new Date();
      switch (joinDateFilter) {
        case 'last30':
          const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000,
          );
          queryBuilder = queryBuilder.andWhere(
            'employee.dateOfJoining > :thirtyDaysAgo',
            { thirtyDaysAgo },
          );
          break;
        case 'last90':
          const ninetyDaysAgo = new Date(
            now.getTime() - 90 * 24 * 60 * 60 * 1000,
          );
          queryBuilder = queryBuilder.andWhere(
            'employee.dateOfJoining > :ninetyDaysAgo',
            { ninetyDaysAgo },
          );
          break;
        case 'thisYear':
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          const endOfYear = new Date(now.getFullYear(), 11, 31);
          queryBuilder = queryBuilder.andWhere(
            'employee.dateOfJoining BETWEEN :startOfYear AND :endOfYear',
            {
              startOfYear,
              endOfYear,
            },
          );
          break;
      }
    }

    // Add search filter
    if (search && search.trim()) {
      queryBuilder = queryBuilder.andWhere(
        '(employee.firstName ILIKE :search OR employee.lastName ILIKE :search OR employee.workEmail ILIKE :search OR employee.employeeCode ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // Add sorting
    const sortColumn =
      sortBy === 'department'
        ? 'department.name'
        : sortBy === 'designation'
          ? 'designation.name'
          : sortBy === 'manager'
            ? 'manager.firstName'
            : sortBy === 'branch'
              ? 'branch.name'
              : `employee.${sortBy}`;

    queryBuilder = queryBuilder.orderBy(
      sortColumn,
      sortOrder.toUpperCase() as 'ASC' | 'DESC',
    );

    // Get total count for pagination
    const total = await queryBuilder.getCount();

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(offset).take(limit);

    // Execute query
    const employees = await queryBuilder.getMany();
    const userRoles = await this.getUserRolesMap(
      employees.map((emp) => emp.userId).filter(Boolean),
    );

    // Attach username for edit UI + signed profile photo
    const employeesWithUserName = await Promise.all(
      employees.map(async (emp: any) => {
        const withPhoto = await this.addSignedProfilePhoto(emp);
        const roles = userRoles.get(emp.userId) || [];
        return {
          ...withPhoto,
          userName: emp?.user?.userName,
          roles,
          roleId: roles[0]?.id ?? null,
          primaryRole: roles[0]?.roleName ?? null,
        };
      }),
    );

    // Attach project assignments and multiple managers
    await this.attachProjectAssignmentsAndManagers(
      employeesWithUserName,
      organizationId,
    );

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    console.log(`📊 Found ${employees.length} employees out of ${total} total`);

    return {
      employees: employeesWithUserName,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  // --- NEW: FIND MANAGERS ---
  async findManagers(organizationId: string) {
    try {
      const cacheKey = `managers:${organizationId}`;
      const cached = await this.cacheManager.get(cacheKey);
      if (cached) {
        console.log('📦 Returning cached managers for org:', organizationId);
        return cached;
      }

      // Return ALL active employees as potential managers (broader selection)
      const managers = await this.employeeRepository.find({
        where: {
          organizationId,
          status: 'active',
        },
        relations: ['designation'],
        order: { firstName: 'ASC' },
      });

      // Sign profile photos in parallel
      const managersWithPhotos = await Promise.all(
        managers.map((emp) => this.addSignedProfilePhoto(emp)),
      );

      // Cache for 10 minutes
      await this.cacheManager.set(cacheKey, managersWithPhotos, 600);
      console.log(
        `✅ Loaded ${managersWithPhotos.length} potential managers for org: ${organizationId}`,
      );

      return managersWithPhotos;
    } catch (error) {
      console.error('❌ Error finding managers:', error);
      return [];
    }
  }

  async getBranchesForOrg(organizationId: string) {
    return this.branchRepository.find({
      where: { organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async getShiftsForOrg(organizationId: string) {
    return this.shiftRepository.find({
      where: { organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  // --- NEW: GET RECENT JOINERS ---
  async getRecentJoiners(organizationId: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const recentJoiners = await this.employeeRepository.find({
        where: {
          organizationId,
          status: 'active',
          dateOfJoining: MoreThan(startDate),
        },
        relations: ['department', 'designation'],
        order: { dateOfJoining: 'DESC' },
        take: 10, // Limit to latest 10
        select: [
          'id',
          'firstName',
          'lastName',
          'employeeCode',
          'dateOfJoining',
          'photoUrl',
          'passportPhotoUrl',
          'workEmail',
        ],
      });

      console.log(
        `📅 Found ${recentJoiners.length} recent joiners in last ${days} days`,
      );
      return Promise.all(
        recentJoiners.map(async (emp) => this.addSignedProfilePhoto(emp)),
      );
    } catch (error) {
      console.error('Error getting recent joiners:', error);
      return [];
    }
  }

  // --- NEW: GET EMPLOYEE STATISTICS BY DEPARTMENT ---
  async getEmployeeStatsByDepartment(organizationId: string) {
    try {
      const stats = await this.entityManager
        .createQueryBuilder(Employee, 'employee')
        .leftJoin('employee.department', 'department')
        .select([
          'department.id as departmentId',
          'department.name as departmentName',
          'COUNT(employee.id) as totalEmployees',
          "COUNT(CASE WHEN employee.status = 'active' THEN 1 END) as activeEmployees",
          "COUNT(CASE WHEN employee.status = 'inactive' THEN 1 END) as inactiveEmployees",
        ])
        .where('employee.organizationId = :organizationId', { organizationId })
        .andWhere('department.id IS NOT NULL')
        .groupBy('department.id, department.name')
        .orderBy('department.name', 'ASC')
        .getRawMany();

      return stats;
    } catch (error) {
      console.error('Error getting employee stats by department:', error);
      return [];
    }
  }

  // --- NEW: GET EMPLOYEE ANALYTICS ---
  async getEmployeeAnalytics(organizationId: string) {
    try {
      const analytics = await Promise.all([
        // Age distribution
        this.entityManager.query(
          `
          SELECT 
            CASE 
              WHEN EXTRACT(YEAR FROM AGE(date_of_birth)) < 25 THEN 'Under 25'
              WHEN EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 25 AND 35 THEN '25-35'
              WHEN EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 36 AND 45 THEN '36-45'
              WHEN EXTRACT(YEAR FROM AGE(date_of_birth)) BETWEEN 46 AND 55 THEN '46-55'
              ELSE 'Over 55'
            END as age_group,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND date_of_birth IS NOT NULL AND status = 'active'
          GROUP BY age_group
          ORDER BY count DESC
        `,
          [organizationId],
        ),

        // Gender distribution
        this.entityManager.query(
          `
          SELECT 
            COALESCE(gender, 'Not Specified') as gender,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND status = 'active'
          GROUP BY gender
          ORDER BY count DESC
        `,
          [organizationId],
        ),

        // Employment type distribution
        this.entityManager.query(
          `
          SELECT 
            COALESCE(employment_type, 'Not Specified') as employment_type,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND status = 'active'
          GROUP BY employment_type
          ORDER BY count DESC
        `,
          [organizationId],
        ),

        // Tenure distribution
        this.entityManager.query(
          `
          SELECT 
            CASE 
              WHEN EXTRACT(YEAR FROM AGE(date_of_joining)) < 1 THEN 'Less than 1 year'
              WHEN EXTRACT(YEAR FROM AGE(date_of_joining)) BETWEEN 1 AND 2 THEN '1-2 years'
              WHEN EXTRACT(YEAR FROM AGE(date_of_joining)) BETWEEN 3 AND 5 THEN '3-5 years'
              WHEN EXTRACT(YEAR FROM AGE(date_of_joining)) BETWEEN 6 AND 10 THEN '6-10 years'
              ELSE 'Over 10 years'
            END as tenure_group,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND status = 'active'
          GROUP BY tenure_group
          ORDER BY count DESC
        `,
          [organizationId],
        ),
      ]);

      return {
        ageDistribution: analytics[0],
        genderDistribution: analytics[1],
        employmentTypeDistribution: analytics[2],
        tenureDistribution: analytics[3],
      };
    } catch (error) {
      console.error('Error getting employee analytics:', error);
      return {
        ageDistribution: [],
        genderDistribution: [],
        employmentTypeDistribution: [],
        tenureDistribution: [],
      };
    }
  }

  // --- NEW: BULK UPDATE EMPLOYEES ---
  async bulkUpdateEmployees(
    employeeIds: string[],
    updateData: Partial<UpdateEmployeeDto>,
  ) {
    try {
      const updateResult = await this.employeeRepository
        .createQueryBuilder()
        .update(Employee)
        .set(updateData)
        .where('id IN (:...ids)', { ids: employeeIds })
        .execute();

      console.log(`✅ Bulk updated ${updateResult.affected} employees`);
      return updateResult;
    } catch (error) {
      console.error('Error in bulk update:', error);
      throw error;
    }
  }

  // --- NEW: EMPLOYEE SEARCH SUGGESTIONS ---
  async getEmployeeSearchSuggestions(
    organizationId: string,
    query: string,
    limit: number = 5,
  ) {
    try {
      if (!query || query.trim().length < 2) {
        return [];
      }

      const suggestions = await this.employeeRepository
        .createQueryBuilder('employee')
        .leftJoinAndSelect('employee.department', 'department')
        .leftJoinAndSelect('employee.designation', 'designation')
        .select([
          'employee.id',
          'employee.firstName',
          'employee.lastName',
          'employee.employeeCode',
          'employee.workEmail',
          'employee.photoUrl',
          'employee.passportPhotoUrl',
          'department.name',
          'designation.name',
        ])
        .where('employee.organizationId = :organizationId', { organizationId })
        .andWhere('employee.status = :status', { status: 'active' })
        .andWhere(
          '(employee.firstName ILIKE :query OR employee.lastName ILIKE :query OR employee.employeeCode ILIKE :query)',
          { query: `%${query.trim()}%` },
        )
        .orderBy('employee.firstName', 'ASC')
        .take(limit)
        .getMany();

      return Promise.all(
        suggestions.map(async (emp) => this.addSignedProfilePhoto(emp)),
      );
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
  }

  // --- EMPLOYEE SELECTOR: lightweight search with department/designation filters ---
  async getEmployeeSelector(
    organizationId: string,
    filters: {
      search?: string;
      departmentId?: string;
      designationId?: string;
      limit?: number;
    },
  ) {
    const { search, departmentId, designationId, limit = 50 } = filters;

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .select([
        'employee.id',
        'employee.firstName',
        'employee.lastName',
        'employee.employeeCode',
        'employee.workEmail',
        'department.id',
        'department.name',
        'designation.id',
        'designation.name',
      ])
      .where('employee.organizationId = :organizationId', { organizationId })
      .andWhere('employee.status = :status', { status: 'active' });

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(employee.firstName ILIKE :s OR employee.lastName ILIKE :s OR employee.employeeCode ILIKE :s OR employee.workEmail ILIKE :s)',
        { s: term },
      );
    }

    if (departmentId && departmentId !== 'all') {
      qb.andWhere('employee.departmentId = :departmentId', { departmentId });
    }

    if (designationId && designationId !== 'all') {
      qb.andWhere('employee.designationId = :designationId', { designationId });
    }

    return qb.orderBy('employee.firstName', 'ASC').take(limit).getMany();
  }

  // --- NEW: GET EMPLOYEE HIERARCHY ---
  async getEmployeeHierarchy(organizationId: string, employeeId?: string) {
    try {
      const baseQuery = this.employeeRepository
        .createQueryBuilder('employee')
        .leftJoinAndSelect('employee.department', 'department')
        .leftJoinAndSelect('employee.designation', 'designation')
        .leftJoinAndSelect('employee.manager', 'manager')
        .where('employee.organizationId = :organizationId', { organizationId })
        .andWhere('employee.status = :status', { status: 'active' });

      if (employeeId) {
        // Get specific employee with their reports
        const employee = await baseQuery
          .andWhere('employee.id = :employeeId', { employeeId })
          .getOne();

        if (!employee) {
          throw new NotFoundException('Employee not found');
        }

        // Get direct reports
        const directReports = await this.employeeRepository.find({
          where: {
            organizationId,
            reportingTo: employeeId,
            status: 'active',
          },
          relations: ['department', 'designation'],
          order: { firstName: 'ASC' },
        });

        return {
          employee: await this.addSignedProfilePhoto(employee),
          directReports: await Promise.all(
            directReports.map((d) => this.addSignedProfilePhoto(d)),
          ),
          reportCount: directReports.length,
        };
      } else {
        // Get all employees without managers (top level)
        const topLevelEmployees = await baseQuery
          .andWhere('employee.reportingTo IS NULL')
          .orderBy('employee.firstName', 'ASC')
          .getMany();

        return Promise.all(
          topLevelEmployees.map((emp) => this.addSignedProfilePhoto(emp)),
        );
      }
    } catch (error) {
      console.error('Error getting employee hierarchy:', error);
      throw error;
    }
  }

  // --- NEW: VALIDATE MANAGER ASSIGNMENT ---
  async validateManagerAssignment(dto: {
    organizationId: string;
    employeeId?: string;
    reportingTo: string;
  }) {
    const { organizationId, employeeId, reportingTo } = dto;
    const errors: string[] = [];

    try {
      // Check if manager exists and is active
      const manager = await this.employeeRepository.findOne({
        where: {
          id: reportingTo,
          organizationId,
          status: 'active',
        },
        relations: ['user'],
      });

      if (!manager) {
        errors.push(
          'Selected manager does not exist, is inactive, or belongs to different organization',
        );
        return { isValid: false, errors };
      }

      // Check circular reference
      if (employeeId && employeeId !== reportingTo) {
        const isCircular = await this.checkCircularReporting(
          employeeId,
          reportingTo,
        );
        if (isCircular) {
          errors.push(
            'Cannot assign manager - creates circular reporting structure',
          );
        }
      }

      // Check if manager can have direct reports (optional business rule)
      const directReports = await this.employeeRepository.count({
        where: { reportingTo, organizationId },
      });

      if (directReports >= 50) {
        // Arbitrary limit, configurable
        errors.push(
          'Manager already has too many direct reports (50+). Consider restructuring.',
        );
      }

      return {
        isValid: errors.length === 0,
        errors,
        manager: {
          id: manager.id,
          name:
            getFullName(
              manager.firstName,
              manager.middleName,
              manager.lastName,
            ) || manager.workEmail,
          currentDirectReports: directReports,
          employeeCount: directReports + (employeeId ? 1 : 0),
        },
      };
    } catch (error) {
      console.error('Error validating manager assignment:', error);
      return {
        isValid: false,
        errors: ['Validation error occurred'],
      };
    }
  }

  private async resolveRoleForEmployee(
    organizationId: string,
    roleId?: string,
  ): Promise<Role> {
    if (roleId) {
      const selectedRole = await this.roleRepository.findOne({
        where: { id: roleId },
      });

      if (!selectedRole) {
        throw new BadRequestException('Selected role was not found');
      }

      const isDefaultRole = selectedRole.type === RoleType.DEFAULT;
      const isOrgRole = selectedRole.organizationId === organizationId;
      const isGlobalRole =
        selectedRole.type === RoleType.CUSTOM && !selectedRole.organizationId;

      if (!isDefaultRole && !isOrgRole && !isGlobalRole) {
        throw new BadRequestException(
          'Selected role does not belong to this organization',
        );
      }

      return selectedRole;
    }

    const employeeRoles = await this.roleRepository.find({
      where: { roleName: 'EMPLOYEE' },
      order: { createdOn: 'ASC' },
    });

    const existingEmployeeRole =
      employeeRoles.find((role) => role.organizationId === organizationId) ||
      employeeRoles.find((role) => role.type === RoleType.DEFAULT) ||
      employeeRoles.find((role) => !role.organizationId);

    if (existingEmployeeRole) {
      return existingEmployeeRole;
    }

    return this.roleRepository.save(
      this.roleRepository.create({
        roleName: 'EMPLOYEE',
        type: RoleType.DEFAULT,
        description: 'Default Employee role',
        createdBy: 'system',
      }),
    );
  }

  private async ensureShiftBelongsToOrganization(
    organizationId: string,
    shiftId?: string | null,
  ): Promise<void> {
    if (!shiftId) return;

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId, organizationId },
      select: ['id'],
    });

    if (!shift) {
      throw new BadRequestException(
        'Selected shift was not found for this organization',
      );
    }
  }

  private async setUserPrimaryRole(userId: string, role: Role) {
    await this.userRoleRepository
      .createQueryBuilder()
      .delete()
      .from(UserRole)
      .where('user_id = :userId', { userId })
      .execute();

    const userRole = this.userRoleRepository.create({
      user: { id: userId } as User,
      role: { id: role.id } as Role,
      isActive: true,
    });

    await this.userRoleRepository.save(userRole);
  }

  private async getUserRolesMap(userIds: string[]) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    const roleMap = new Map<string, { id: string; roleName: string }[]>();

    if (uniqueUserIds.length === 0) {
      return roleMap;
    }

    const rows = await this.userRoleRepository
      .createQueryBuilder('userRole')
      .innerJoin('userRole.user', 'user')
      .innerJoin('userRole.role', 'role')
      .select('user.id', 'userId')
      .addSelect('role.id', 'roleId')
      .addSelect('role.roleName', 'roleName')
      .where('user.id IN (:...userIds)', { userIds: uniqueUserIds })
      .andWhere('userRole.isActive = :isActive', { isActive: true })
      .orderBy('userRole.assignedOn', 'ASC')
      .getRawMany();

    for (const row of rows) {
      const existing = roleMap.get(row.userId) || [];
      existing.push({ id: row.roleId, roleName: row.roleName });
      roleMap.set(row.userId, existing);
    }

    return roleMap;
  }

  // --- HELPER: CHECK CIRCULAR REPORTING ---
  private async checkCircularReporting(
    employeeId: string,
    managerId: string,
  ): Promise<boolean> {
    if (employeeId === managerId) {
      return true;
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: managerId },
      select: ['id', 'reportingTo'],
    });

    if (!manager || !manager.reportingTo) {
      return false;
    }

    return this.checkCircularReporting(employeeId, manager.reportingTo);
  }

  // --- ATTACH PROJECT ASSIGNMENTS & MULTIPLE MANAGERS ---
  async attachProjectAssignmentsAndManagers(
    employees: any[],
    organizationId: string,
  ): Promise<void> {
    if (!employees || employees.length === 0) return;

    const empIds = employees.map((e) => e.id).filter(Boolean);
    if (empIds.length === 0) return;

    const assignments = await this.assignmentRepository.find({
      where: {
        organizationId,
        employeeId: In(empIds),
      },
      order: { createdAt: 'ASC' },
    });

    const projectIds = Array.from(
      new Set(assignments.map((a) => a.projectId).filter(Boolean)),
    );
    const managerIds = Array.from(
      new Set(
        [
          ...assignments.map((a) => a.managerId).filter(Boolean),
          ...employees.map((e) => e.reportingTo).filter(Boolean),
        ].filter(Boolean),
      ),
    );

    const [internalProjects, clientProjects, managers] = await Promise.all([
      projectIds.length
        ? this.projectRepository.find({
            where: { id: In(projectIds), organizationId },
            select: ['id', 'name', 'status'],
          })
        : [],
      projectIds.length
        ? this.clientProjectRepository.find({
            where: { id: In(projectIds), organizationId },
            select: ['id', 'projectName', 'projectCode', 'status'],
          })
        : [],
      managerIds.length
        ? this.employeeRepository.find({
            where: { id: In(managerIds), organizationId },
            relations: ['designation'],
            select: [
              'id',
              'firstName',
              'lastName',
              'workEmail',
              'photoUrl',
              'passportPhotoUrl',
              'status',
              'employeeCode',
            ],
          })
        : [],
    ]);

    const projectMap = new Map<string, any>();
    for (const p of internalProjects) {
      projectMap.set(`internal:${p.id}`, { ...p, source: 'internal' });
      projectMap.set(p.id, { ...p, source: 'internal' });
    }
    for (const cp of clientProjects) {
      const obj = {
        id: cp.id,
        name: cp.projectName,
        code: cp.projectCode,
        status: cp.status,
        source: 'client',
      };
      projectMap.set(`client:${cp.id}`, obj);
      if (!projectMap.has(cp.id)) {
        projectMap.set(cp.id, obj);
      }
    }

    const managerMap = new Map<string, any>();
    for (const m of managers) {
      const signedPhoto = await this.signIfNeeded(this.getProfilePhotoKey(m));
      managerMap.set(m.id, {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        workEmail: m.workEmail,
        employeeCode: m.employeeCode,
        photoUrl: signedPhoto,
        status: m.status,
        isActive: m.status === 'active',
      });
    }

    const assignmentsByEmp = new Map<string, any[]>();
    for (const a of assignments) {
      const projKey = a.projectSource
        ? `${a.projectSource}:${a.projectId}`
        : a.projectId;
      const project = projectMap.get(projKey) ||
        projectMap.get(a.projectId) || {
          id: a.projectId,
          name: 'Project',
          source: a.projectSource || 'internal',
        };
      const manager = a.managerId ? managerMap.get(a.managerId) || null : null;

      const item = {
        id: a.id,
        employeeId: a.employeeId,
        projectId: a.projectId,
        projectSource: a.projectSource || 'internal',
        managerId: a.managerId,
        managerType: a.managerType || 'SECONDARY',
        role: a.role || 'member',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        project,
        manager,
      };

      const list = assignmentsByEmp.get(a.employeeId) || [];
      list.push(item);
      assignmentsByEmp.set(a.employeeId, list);
    }

    for (const emp of employees) {
      const empAssignments = assignmentsByEmp.get(emp.id) || [];
      emp.projectAssignments = empAssignments;

      // Group managers by manager.id and aggregate their projects
      const managerDict = new Map<string, any>();

      // 1. First add legacy primary manager if present
      const primaryMgrId = emp.reportingTo;
      if (primaryMgrId && managerMap.has(primaryMgrId)) {
        const mgrData = managerMap.get(primaryMgrId);
        managerDict.set(primaryMgrId, {
          ...mgrData,
          managerType: 'PRIMARY',
          projects: [],
        });
      } else if (emp.manager) {
        managerDict.set(emp.manager.id, {
          id: emp.manager.id,
          firstName: emp.manager.firstName,
          lastName: emp.manager.lastName,
          workEmail: emp.manager.workEmail,
          employeeCode: emp.manager.employeeCode,
          photoUrl: emp.manager.photoUrl || null,
          status: emp.manager.status || 'active',
          isActive: (emp.manager.status || 'active') === 'active',
          managerType: 'PRIMARY',
          projects: [],
        });
      }

      // 2. Attach managers from project assignments
      for (const a of empAssignments) {
        if (a.manager) {
          const mId = a.manager.id;
          const isPrimary = mId === primaryMgrId || a.managerType === 'PRIMARY';
          const existing = managerDict.get(mId);

          const projectItem = {
            id: a.project?.id,
            name: a.project?.name || 'Project',
            code: a.project?.code,
            source: a.projectSource,
            assignmentId: a.id,
            role: a.role,
            managerType: isPrimary ? 'PRIMARY' : a.managerType || 'SECONDARY',
          };

          if (existing) {
            if (isPrimary) existing.managerType = 'PRIMARY';
            const hasProj = existing.projects.some(
              (p: any) => p.id === projectItem.id,
            );
            if (!hasProj) {
              existing.projects.push(projectItem);
            }
          } else {
            managerDict.set(mId, {
              ...a.manager,
              managerType: isPrimary ? 'PRIMARY' : a.managerType || 'SECONDARY',
              projects: [projectItem],
            });
          }
        }
      }

      // If primary manager has no projects assigned, assign 'General'
      for (const [, mgr] of managerDict) {
        if (mgr.projects.length === 0) {
          mgr.projects.push({
            id: 'general',
            name: 'General',
            source: 'general',
            role: 'Reporting Manager',
            managerType: mgr.managerType,
          });
        }
      }

      // Sort: PRIMARY first, then SECONDARY
      const managersList = Array.from(managerDict.values()).sort((a, b) => {
        if (a.managerType === 'PRIMARY' && b.managerType !== 'PRIMARY')
          return -1;
        if (b.managerType === 'PRIMARY' && a.managerType !== 'PRIMARY')
          return 1;
        return 0;
      });

      emp.managers = managersList;
    }
  }

  // --- MANAGERS CRUD ---
  async getEmployeeManagers(organizationId: string, employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
      relations: ['manager'],
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    await this.attachProjectAssignmentsAndManagers([employee], organizationId);
    return (employee as any).managers || [];
  }

  async assignManager(
    organizationId: string,
    employeeId: string,
    dto: AssignManagerDto,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: dto.managerId, organizationId },
    });
    if (!manager) {
      throw new BadRequestException(
        `Manager with ID ${dto.managerId} not found`,
      );
    }
    if (manager.status !== 'active') {
      throw new BadRequestException(
        `Cannot assign inactive employee (${getFullName(manager.firstName, manager.middleName, manager.lastName)}) as manager`,
      );
    }
    if (manager.id === employeeId) {
      throw new BadRequestException(
        'Employee cannot be assigned as their own manager',
      );
    }

    // Check circular reporting
    const isCircular = await this.checkCircularReporting(
      employeeId,
      dto.managerId,
    );
    if (isCircular) {
      throw new BadRequestException(
        'Circular reporting relationship detected. Cannot assign manager.',
      );
    }

    // Primary / Secondary rule:
    // If employee has no primary manager (reportingTo is null), this first manager is PRIMARY.
    // If employee already has a reportingTo, new manager defaults to SECONDARY unless requested as PRIMARY.
    const isFirstManager = !employee.reportingTo;
    const requestedType =
      dto.managerType || (isFirstManager ? 'PRIMARY' : 'SECONDARY');

    if (requestedType === 'PRIMARY') {
      employee.reportingTo = manager.id;
      await this.employeeRepository.save(employee);
    }

    if (dto.projectId) {
      let assignment = await this.assignmentRepository.findOne({
        where: {
          organizationId,
          employeeId,
          projectId: dto.projectId,
          projectSource: dto.projectSource || 'internal',
        },
      });

      if (assignment) {
        assignment.managerId = dto.managerId;
        assignment.managerType = requestedType;
        if (dto.role) assignment.role = dto.role;
        await this.assignmentRepository.save(assignment);
      } else {
        assignment = this.assignmentRepository.create({
          organizationId,
          employeeId,
          projectId: dto.projectId,
          projectSource: dto.projectSource || 'internal',
          managerId: dto.managerId,
          managerType: requestedType,
          role: dto.role || 'member',
        });
        await this.assignmentRepository.save(assignment);
      }
    }

    await this.invalidateEmployeeCache(organizationId, employeeId);
    return this.getEmployeeManagers(organizationId, employeeId);
  }

  async setPrimaryManager(
    organizationId: string,
    employeeId: string,
    managerId: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: managerId, organizationId },
    });
    if (!manager) {
      throw new BadRequestException(`Manager with ID ${managerId} not found`);
    }
    if (manager.status !== 'active') {
      throw new BadRequestException(
        'Cannot set inactive employee as primary manager',
      );
    }

    // Check circular reporting
    const isCircular = await this.checkCircularReporting(employeeId, managerId);
    if (isCircular) {
      throw new BadRequestException(
        'Circular reporting relationship detected.',
      );
    }

    employee.reportingTo = managerId;
    await this.employeeRepository.save(employee);

    // Update assignment managerTypes
    const assignments = await this.assignmentRepository.find({
      where: { organizationId, employeeId },
    });
    for (const a of assignments) {
      if (a.managerId === managerId) {
        a.managerType = 'PRIMARY';
      } else if (a.managerType === 'PRIMARY') {
        a.managerType = 'SECONDARY';
      }
      await this.assignmentRepository.save(a);
    }

    await this.invalidateEmployeeCache(organizationId, employeeId);
    return this.getEmployeeManagers(organizationId, employeeId);
  }

  async removeManager(
    organizationId: string,
    employeeId: string,
    managerId: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // Remove or clear managerId from project assignments
    const assignments = await this.assignmentRepository.find({
      where: { organizationId, employeeId, managerId },
    });
    for (const a of assignments) {
      a.managerId = null as any;
      a.managerType = 'SECONDARY';
      await this.assignmentRepository.save(a);
    }

    // If removing primary manager, pick next available manager or set to null
    if (employee.reportingTo === managerId) {
      const remainingAssignments = await this.assignmentRepository.find({
        where: { organizationId, employeeId },
      });
      const nextMgrId = remainingAssignments.find(
        (a) => a.managerId && a.managerId !== managerId,
      )?.managerId;
      employee.reportingTo = nextMgrId || null;
      await this.employeeRepository.save(employee);
    }

    await this.invalidateEmployeeCache(organizationId, employeeId);
    return this.getEmployeeManagers(organizationId, employeeId);
  }

  // --- ASSETS & CLEARANCE CRUD ---
  async getEmployeeAssets(organizationId: string, employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    return this.assetRepository.find({
      where: { organizationId, employeeId },
      order: { issueDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async createEmployeeAsset(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeAssetDto,
    createdById?: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const asset = this.assetRepository.create({
      organizationId,
      employeeId,
      assetType: dto.assetType,
      assetName: dto.assetName,
      assetId: dto.assetId,
      serialNumber: dto.serialNumber || null,
      brand: dto.brand || null,
      model: dto.model || null,
      condition: dto.condition || 'Good',
      issueDate: dto.issueDate,
      expectedReturnDate: dto.expectedReturnDate || null,
      actualReturnDate: null,
      status: dto.status || AssetStatus.ASSIGNED,
      isReturnRequired:
        dto.isReturnRequired !== undefined ? dto.isReturnRequired : true,
      notes: dto.notes || null,
    });

    return this.assetRepository.save(asset);
  }

  async updateEmployeeAsset(
    organizationId: string,
    employeeId: string,
    assetId: string,
    dto: UpdateEmployeeAssetDto,
  ) {
    const asset = await this.assetRepository.findOne({
      where: { id: assetId, organizationId, employeeId },
    });
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${assetId} not found`);
    }

    if (dto.assetType !== undefined) asset.assetType = dto.assetType;
    if (dto.assetName !== undefined) asset.assetName = dto.assetName;
    if (dto.assetId !== undefined) asset.assetId = dto.assetId;
    if (dto.serialNumber !== undefined)
      asset.serialNumber = dto.serialNumber || null;
    if (dto.brand !== undefined) asset.brand = dto.brand || null;
    if (dto.model !== undefined) asset.model = dto.model || null;
    if (dto.condition !== undefined) asset.condition = dto.condition;
    if (dto.issueDate !== undefined) asset.issueDate = dto.issueDate;
    if (dto.expectedReturnDate !== undefined)
      asset.expectedReturnDate = dto.expectedReturnDate || null;
    if (dto.actualReturnDate !== undefined)
      asset.actualReturnDate = dto.actualReturnDate || null;
    if (dto.status !== undefined) asset.status = dto.status;
    if (dto.isReturnRequired !== undefined)
      asset.isReturnRequired = dto.isReturnRequired;
    if (dto.notes !== undefined) asset.notes = dto.notes || null;

    return this.assetRepository.save(asset);
  }

  async returnEmployeeAsset(
    organizationId: string,
    employeeId: string,
    assetId: string,
    dto: ReturnAssetDto,
  ) {
    const asset = await this.assetRepository.findOne({
      where: { id: assetId, organizationId, employeeId },
    });
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${assetId} not found`);
    }

    asset.status = AssetStatus.RETURNED;
    asset.actualReturnDate = dto.actualReturnDate || DateTime.now().toISODate();
    if (dto.condition) asset.condition = dto.condition;
    if (dto.notes) {
      asset.notes = asset.notes
        ? `${asset.notes} | Return note: ${dto.notes}`
        : dto.notes;
    }

    return this.assetRepository.save(asset);
  }

  async getMyPendingAcknowledgedAssets(organizationId: string, userId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { userId, organizationId },
      select: ['id'],
    });
    if (!employee) {
      throw new NotFoundException('Employee record not found for this user');
    }

    return this.assetRepository.find({
      where: {
        organizationId,
        employeeId: employee.id,
        acknowledged: false,
        status: Not(AssetStatus.RETURNED),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async acknowledgeAsset(
    organizationId: string,
    userId: string,
    assetId: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { userId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee record not found for this user');
    }

    const asset = await this.assetRepository.findOne({
      where: { id: assetId, organizationId, employeeId: employee.id },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found for this employee');
    }

    if (asset.acknowledged) {
      return asset;
    }

    asset.acknowledged = true;
    asset.acknowledgedAt = new Date();
    asset.acknowledgedByUserId = userId;
    const saved = await this.assetRepository.save(asset);

    // Notify the admin (org email or HR mail) with the acknowledgement.
    try {
      const org = await this.organizationRepository.findOne({
        where: { id: organizationId },
        select: ['organizationName', 'email', 'hrMail'],
      });
      const adminEmail = org?.email || org?.hrMail;
      if (adminEmail) {
        await this.mailService.sendAssetAcknowledgementEmail({
          organizationId,
          recipientEmail: adminEmail,
          employeeName:
            getFullName(
              employee.firstName,
              employee.middleName,
              employee.lastName,
            ) || employee.firstName,
          assetName: saved.assetName,
          assetId: saved.assetId,
          issuedDate: saved.issueDate,
        });
      }
    } catch (err) {
      console.warn('Failed to send asset acknowledgement email:', err);
    }

    return saved;
  }

  async updateMyProfile(
    organizationId: string,
    userId: string,
    dto: { contactNumber?: string; panNumber?: string; aadhaarNumber?: string },
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { userId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee record not found for this user');
    }

    if (dto.contactNumber !== undefined) {
      employee.contactNumber = dto.contactNumber.trim() || null;
    }
    if (dto.panNumber !== undefined) {
      employee.panNumber = dto.panNumber.trim() || null;
    }
    if (dto.aadhaarNumber !== undefined) {
      employee.aadhaarNumber = dto.aadhaarNumber.trim() || null;
    }

    const saved = await this.employeeRepository.save(employee);

    // Keep the login-identity mobile number in sync with the employee phone.
    if (dto.contactNumber !== undefined && employee.userId) {
      try {
        const user = await this.userRepository.findOne({
          where: { id: employee.userId },
        });
        if (user) {
          user.mobileNumber = saved.contactNumber
            ? String(saved.contactNumber).trim()
            : null;
          await this.userRepository.save(user);
        }
      } catch (err) {
        console.warn('Failed to sync user mobile number:', err);
      }
    }

    return saved;
  }

  async deleteEmployeeAsset(
    organizationId: string,
    employeeId: string,
    assetId: string,
  ) {
    const asset = await this.assetRepository.findOne({
      where: { id: assetId, organizationId, employeeId },
    });
    if (!asset) {
      throw new NotFoundException(`Asset with ID ${assetId} not found`);
    }

    await this.assetRepository.remove(asset);
    return { success: true, message: 'Asset deleted successfully' };
  }

  async getEmployeeClearance(organizationId: string, employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const assets = await this.assetRepository.find({
      where: { organizationId, employeeId },
      order: { issueDate: 'ASC' },
    });

    const requiredAssets = assets.filter((a) => a.isReturnRequired);
    const pendingAssets = requiredAssets.filter(
      (a) => a.status !== AssetStatus.RETURNED,
    );
    const returnedAssets = requiredAssets.filter(
      (a) => a.status === AssetStatus.RETURNED,
    );

    let status: 'NOT_STARTED' | 'PARTIALLY_CLEARED' | 'CLEARED' = 'CLEARED';
    let isCleared = true;

    if (requiredAssets.length > 0) {
      if (pendingAssets.length === 0) {
        status = 'CLEARED';
        isCleared = true;
      } else if (returnedAssets.length === 0) {
        status = 'NOT_STARTED';
        isCleared = false;
      } else {
        status = 'PARTIALLY_CLEARED';
        isCleared = false;
      }
    }

    return {
      status,
      isCleared,
      totalAssets: assets.length,
      totalRequired: requiredAssets.length,
      pendingCount: pendingAssets.length,
      returnedCount: returnedAssets.length,
      pendingAssets: pendingAssets.map((a) => ({
        id: a.id,
        assetName: a.assetName,
        assetId: a.assetId,
        assetType: a.assetType,
        status: a.status,
        issueDate: a.issueDate,
      })),
      assets,
    };
  }

  // --- DOCUMENTS CRUD ---
  async getEmployeeDocuments(
    organizationId: string,
    employeeId: string,
    category?: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const where: any = { organizationId, employeeId };
    if (category && category !== 'All') {
      where.documentCategory = category;
    }

    const docs = await this.documentRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return await Promise.all(
      docs.map(async (doc) => {
        let downloadUrl = doc.fileUrl;
        if (
          !doc.fileUrl.startsWith('http') &&
          !doc.fileUrl.startsWith('data:')
        ) {
          try {
            downloadUrl =
              (await this.storageService.getSignedUrl(doc.fileUrl)) ||
              doc.fileUrl;
          } catch (e) {
            // Keep doc.fileUrl
          }
        }
        return {
          ...doc,
          downloadUrl,
        };
      }),
    );
  }

  async createEmployeeDocument(
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeDocumentDto,
    uploadedById?: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const doc = this.documentRepository.create({
      organizationId,
      employeeId,
      documentName: dto.documentName,
      documentCategory: dto.documentCategory || 'Other',
      fileUrl: dto.fileUrl,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      remarks: dto.remarks,
      uploadedBy: uploadedById,
    });

    return this.documentRepository.save(doc);
  }

  async deleteEmployeeDocument(
    organizationId: string,
    employeeId: string,
    documentId: string,
  ) {
    const doc = await this.documentRepository.findOne({
      where: { id: documentId, organizationId, employeeId },
    });
    if (!doc) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    await this.documentRepository.remove(doc);
    return { success: true, message: 'Document deleted successfully' };
  }

  // --- FULL & FINAL SETTLEMENT & PDF ---
  async getEmployeeSettlement(organizationId: string, employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
      relations: ['department', 'designation', 'manager'],
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const [
      existingSettlement,
      clearance,
      resignationReq,
      salaryStructure,
      leaveBalances,
    ] = await Promise.all([
      this.settlementRepository.findOne({
        where: { organizationId, employeeId },
      }),
      this.getEmployeeClearance(organizationId, employeeId),
      this.resignationRepository.findOne({
        where: { employeeId, organizationId },
        order: { createdAt: 'DESC' },
      }),
      this.salaryStructureRepository.findOne({
        where: { employeeId, organizationId, status: 'active' },
      }),
      employee.userId
        ? this.leaveBalanceRepository.find({
            where: { user: { id: employee.userId } as any },
            relations: ['leaveType'],
          })
        : [],
    ]);

    let totalLeaveDays = 0;
    for (const lb of leaveBalances) {
      const bal = Number(
        lb.closingBalance ?? lb.openingBalance + lb.accrued - lb.consumed,
      );
      if (bal > 0) {
        totalLeaveDays += bal;
      }
    }

    const monthlyGross = salaryStructure
      ? Number(salaryStructure.grossSalary || salaryStructure.basic || 0)
      : 0;
    const dailyRate = monthlyGross > 0 ? monthlyGross / 30 : 0;
    const encashmentAmount =
      totalLeaveDays > 0 && dailyRate > 0
        ? Math.round(totalLeaveDays * dailyRate)
        : null;
    const resignationDate = resignationReq?.createdAt
      ? DateTime.fromJSDate(new Date(resignationReq.createdAt)).toISODate()
      : null;

    const lastWorkingDate =
      resignationReq?.approvedLastWorkingDay ||
      resignationReq?.proposedLastWorkingDay ||
      (employee.dateOfExit
        ? DateTime.fromJSDate(new Date(employee.dateOfExit)).toISODate()
        : null);

    const noticeDays = 30;

    if (!existingSettlement) {
      const defaultEarnings = {
        salaryDue: null as number | null,
        pendingSalary: null as number | null,
        leaveEncashmentDays: totalLeaveDays > 0 ? totalLeaveDays : null,
        leaveEncashmentAmount: encashmentAmount,
        bonusAmount: null as number | null,
        incentiveAmount: null as number | null,
        otherPayableAmount: null as number | null,
        totalEarnings: encashmentAmount,
      };

      const defaultDeductions = {
        noticePeriodRecoveryAmount: null as number | null,
        loanRecoveryAmount: null as number | null,
        assetDeductionAmount: null as number | null,
        otherDeductionsAmount: null as number | null,
        deductionsRemarks: null as string | null,
        totalDeductions: null as number | null,
      };

      const netSettlementAmount = encashmentAmount;

      return {
        isSaved: false,
        employee,
        clearance,
        settlement: {
          organizationId,
          employeeId,
          resignationRequestId: resignationReq?.id || null,
          resignationDate,
          noticePeriodDays: noticeDays,
          lastWorkingDate,
          reasonForLeaving: resignationReq?.message || null,
          ...defaultEarnings,
          ...defaultDeductions,
          finalSettlementAmount: netSettlementAmount,
          netSettlementAmount,
          status: SettlementStatus.DRAFT,
          preparedBy: null as string | null,
          hrApprovalName: null as string | null,
          financeApprovalName: null as string | null,
          approvalDate: null as string | null,
          employeeDeclarationAcknowledged: false,
          remarks: null as string | null,
        },
      };
    }

    return {
      isSaved: true,
      employee,
      clearance,
      settlement: {
        ...existingSettlement,
        netSettlementAmount:
          existingSettlement.finalSettlementAmount !== null &&
          existingSettlement.finalSettlementAmount !== undefined
            ? Number(existingSettlement.finalSettlementAmount)
            : null,
      },
    };
  }

  async saveEmployeeSettlement(
    organizationId: string,
    employeeId: string,
    dto: SaveSettlementDto,
    preparedById?: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // Check if finalizing without clearance
    if (
      dto.status === SettlementStatus.FINALIZED ||
      dto.status === SettlementStatus.APPROVED
    ) {
      const clearance = await this.getEmployeeClearance(
        organizationId,
        employeeId,
      );
      if (!clearance.isCleared) {
        throw new ForbiddenException(
          'Cannot finalize or approve settlement because company assets are still pending return.',
        );
      }
    }

    const parseNullableNumber = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    };

    // ✅ Validate: Last Working Date MUST be >= Resignation Date
    if (dto.lastWorkingDate && dto.resignationDate) {
      const lwd = new Date(String(dto.lastWorkingDate).slice(0, 10));
      const rd = new Date(String(dto.resignationDate).slice(0, 10));
      if (lwd < rd) {
        throw new BadRequestException({
          message:
            'Last Working Date must be greater than or equal to Resignation Date.',
          validation: 'lastWorkingDate_vs_resignationDate',
        });
      }
    }

    let settlement = await this.settlementRepository.findOne({
      where: { organizationId, employeeId },
    });

    if (!settlement) {
      settlement = this.settlementRepository.create({
        organizationId,
        employeeId,
      });
    }

    settlement.resignationRequestId = dto.resignationRequestId || null;
    if (dto.resignationDate !== undefined)
      settlement.resignationDate = dto.resignationDate
        ? String(dto.resignationDate).slice(0, 10)
        : null;
    if (dto.noticePeriodDays !== undefined)
      settlement.noticePeriodDays =
        dto.noticePeriodDays !== null &&
        dto.noticePeriodDays !== undefined &&
        (dto.noticePeriodDays as any) !== ''
          ? Number(dto.noticePeriodDays)
          : 0;
    if (dto.lastWorkingDate !== undefined)
      settlement.lastWorkingDate = dto.lastWorkingDate
        ? String(dto.lastWorkingDate).slice(0, 10)
        : null;
    if (dto.reasonForLeaving !== undefined)
      settlement.reasonForLeaving = dto.reasonForLeaving || null;

    if (dto.salaryDue !== undefined)
      settlement.salaryDue = parseNullableNumber(dto.salaryDue);
    if (dto.pendingSalary !== undefined)
      settlement.pendingSalary = parseNullableNumber(dto.pendingSalary);
    if (dto.leaveEncashmentDays !== undefined)
      settlement.leaveEncashmentDays = parseNullableNumber(
        dto.leaveEncashmentDays,
      );
    if (dto.leaveEncashmentAmount !== undefined)
      settlement.leaveEncashmentAmount = parseNullableNumber(
        dto.leaveEncashmentAmount,
      );
    if (dto.bonusAmount !== undefined)
      settlement.bonusAmount = parseNullableNumber(dto.bonusAmount);
    if (dto.incentiveAmount !== undefined)
      settlement.incentiveAmount = parseNullableNumber(dto.incentiveAmount);
    if (dto.otherPayableAmount !== undefined)
      settlement.otherPayableAmount = parseNullableNumber(
        dto.otherPayableAmount,
      );

    const earningsArray = [
      settlement.salaryDue,
      settlement.pendingSalary,
      settlement.leaveEncashmentAmount,
      settlement.bonusAmount,
      settlement.incentiveAmount,
      settlement.otherPayableAmount,
    ].filter((v) => v !== null && v !== undefined);

    settlement.totalEarnings =
      earningsArray.length > 0
        ? earningsArray.reduce((acc, curr) => acc + Number(curr), 0)
        : null;

    if (dto.noticePeriodRecoveryAmount !== undefined)
      settlement.noticePeriodRecoveryAmount = parseNullableNumber(
        dto.noticePeriodRecoveryAmount,
      );
    if (dto.loanRecoveryAmount !== undefined)
      settlement.loanRecoveryAmount = parseNullableNumber(
        dto.loanRecoveryAmount,
      );
    if (dto.assetDeductionAmount !== undefined)
      settlement.assetDeductionAmount = parseNullableNumber(
        dto.assetDeductionAmount,
      );
    if (dto.otherDeductionsAmount !== undefined)
      settlement.otherDeductionsAmount = parseNullableNumber(
        dto.otherDeductionsAmount,
      );

    const deductionsArray = [
      settlement.noticePeriodRecoveryAmount,
      settlement.loanRecoveryAmount,
      settlement.assetDeductionAmount,
      settlement.otherDeductionsAmount,
    ].filter((v) => v !== null && v !== undefined);

    settlement.totalDeductions =
      deductionsArray.length > 0
        ? deductionsArray.reduce((acc, curr) => acc + Number(curr), 0)
        : null;

    if (
      settlement.totalEarnings !== null ||
      settlement.totalDeductions !== null
    ) {
      settlement.finalSettlementAmount =
        (settlement.totalEarnings ?? 0) - (settlement.totalDeductions ?? 0);
    } else {
      settlement.finalSettlementAmount = null;
    }
    settlement.netSettlementAmount = settlement.finalSettlementAmount;

    settlement.deductionsRemarks = dto.deductionsRemarks || null;

    if (dto.status) settlement.status = dto.status as SettlementStatus;
    if (dto.preparedBy !== undefined)
      settlement.preparedBy = dto.preparedBy || null;
    if (dto.hrApprovalName !== undefined)
      settlement.hrApprovalName = dto.hrApprovalName || null;
    if (dto.financeApprovalName !== undefined)
      settlement.financeApprovalName = dto.financeApprovalName || null;
    if (dto.approvalDate !== undefined)
      settlement.approvalDate = dto.approvalDate
        ? String(dto.approvalDate).slice(0, 10)
        : null;
    if (dto.employeeDeclarationAcknowledged !== undefined)
      settlement.employeeDeclarationAcknowledged = Boolean(
        dto.employeeDeclarationAcknowledged,
      );
    if (dto.remarks !== undefined) settlement.remarks = dto.remarks || null;

    return this.settlementRepository.save(settlement);
  }

  private async launchPuppeteerBrowser(): Promise<puppeteer.Browser> {
    const candidatePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/snap/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter((p): p is string => !!p && fs.existsSync(p));

    const executablePath =
      candidatePaths.length > 0 ? candidatePaths[0] : undefined;

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
    ];

    return puppeteer.launch({
      headless: true,
      executablePath,
      args,
    });
  }

  private stripHtmlToLines(html: string): string[] {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  /**
   * Shared professional CSS styles for all PDF documents.
   * Uses a corporate neutral design system with optional brand color.
   * Designed for A4 @page with proper margins and print quality.
   */
  private buildProfessionalPdfStyles(
    options: {
      brandColor?: string;
      brandColorLight?: string;
      showPageNumbers?: boolean;
      showHeader?: boolean;
      showFooter?: boolean;
      footerText?: string;
    } = {},
  ): string {
    const brandColor = this.sanitizeBrandColor(options.brandColor) || '#1e3a5f'; // Professional dark blue
    const brandColorLight =
      options.brandColorLight || this.hexToRgba(brandColor, 0.06);

    return `
      @page { size: A4; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;
        color: #1a1a2e;
        background: #fff;
        margin: 0;
        padding: 0;
        font-size: 11px;
        line-height: 1.5;
      }
      /* Page header (in-document letterhead on first page) */
      .doc-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid ${brandColor};
        padding-bottom: 10px;
        margin-bottom: 18px;
      }
      .doc-header .org-info h1 {
        margin: 0 0 4px 0;
        font-size: 17px;
        font-weight: 700;
        color: ${brandColor};
        text-transform: uppercase;
        letter-spacing: 0.4px;
        line-height: 1.2;
      }
      .doc-header .org-info p {
        margin: 1px 0;
        color: #5a6a85;
        font-size: 9px;
        line-height: 1.4;
      }
      .doc-header .org-logo {
        max-height: 55px;
        max-width: 150px;
        object-fit: contain;
      }
      /* Document end note (page numbers handled by print engine footer) */
      .doc-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #d0d8e8;
        padding-top: 8px;
        margin-top: 18px;
        font-size: 8.5px;
        color: #7a8aa3;
      }
      .doc-footer .page-info {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .doc-footer .confidential { font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }

      /* Document title bar */
      .doc-title-bar {
        background: ${brandColorLight};
        border: 1px solid ${brandColor}40;
        border-left: 4px solid ${brandColor};
        padding: 10px 14px;
        margin-bottom: 20px;
        text-align: center;
        page-break-inside: avoid;
      }
      .doc-title-bar h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: ${brandColor};
        letter-spacing: 0.6px;
        text-transform: uppercase;
      }

      /* Section container */
      .section { margin-bottom: 20px; page-break-inside: avoid; }
      .section-title {
        font-size: 11px;
        font-weight: 700;
        color: ${brandColor};
        text-transform: uppercase;
        letter-spacing: 0.4px;
        background: ${brandColorLight};
        border-left: 4px solid ${brandColor};
        padding: 8px 12px;
        margin: 0 0 12px 0;
      }

      /* Info cards grid */
      .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 18px;
        page-break-inside: avoid;
      }
      .info-card {
        border: 1px solid #d8dfea;
        border-radius: 6px;
        padding: 12px 14px;
        background: #fafbfd;
      }
      .info-card-title {
        font-size: 9.5px;
        font-weight: 700;
        text-transform: uppercase;
        color: ${brandColor};
        letter-spacing: 0.3px;
        border-bottom: 1px solid #d8dfea;
        padding-bottom: 6px;
        margin-bottom: 10px;
      }
      .info-table { width: 100%; border-collapse: collapse; }
      .info-table td { padding: 3.5px 0; font-size: 10px; vertical-align: top; }
      .info-table td.label { color: #5a6a85; width: 48%; }
      .info-table td.value { font-weight: 600; color: #1a1a2e; text-align: right; }

      /* Data tables */
      .data-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; page-break-inside: auto; }
      .data-table thead { display: table-header-group; }
      .data-table tr { page-break-inside: avoid; }
      .data-table th, .data-table td {
        border: 1px solid #d0d8e8;
        padding: 7px 10px;
        font-size: 10px;
        vertical-align: middle;
      }
      .data-table th {
        background: ${brandColorLight};
        text-align: left;
        font-weight: 600;
        color: ${brandColor};
        border-bottom: 2px solid ${brandColor};
      }
      .data-table tbody tr:nth-child(even) { background: #fafbfd; }
      .data-table tbody tr.total-row {
        background: ${brandColorLight};
        font-weight: 700;
      }
      .data-table .text-right { text-align: right; }
      .data-table .text-center { text-align: center; }
      .data-table td.remarks { color: #6b7b94; font-size: 9px; }

      /* Status badge */
      .status-badge {
        display: inline-block;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 8.5px;
        font-weight: 600;
        letter-spacing: 0.2px;
        text-transform: uppercase;
      }
      .status-badge.cleared { background: #e8f5e9; color: #2e7d32; }
      .status-badge.pending { background: #fff3e0; color: #e65100; }
      .status-badge.draft { background: #e8eaf6; color: #283593; }

      /* Net amount banner */
      .net-banner {
        background: ${brandColor};
        color: #fff;
        padding: 12px 16px;
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 18px 0;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
        page-break-inside: avoid;
      }
      .net-banner .label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: rgba(255, 255, 255, 0.85);
      }
      .net-banner .amount {
        font-size: 20px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.5px;
      }

      /* Declaration box */
      .declaration-box {
        border: 1px solid #d0d8e8;
        border-left: 4px solid ${brandColor};
        background: #fafbfd;
        padding: 12px 14px;
        border-radius: 4px;
        font-size: 9.5px;
        color: #3a4a64;
        line-height: 1.6;
        margin-bottom: 20px;
        page-break-inside: avoid;
      }
      .declaration-box strong { color: ${brandColor}; }

      /* Signatures grid */
      .sig-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
        margin-top: 24px;
        page-break-inside: avoid;
      }
      .sig-box {
        border: 1px solid #c0c8d8;
        border-radius: 6px;
        padding: 14px;
        min-height: 95px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        font-size: 9.5px;
      }
      .sig-title {
        font-weight: 700;
        color: ${brandColor};
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        font-size: 9px;
        border-bottom: 1px solid #d8dfea;
        padding-bottom: 6px;
        margin-bottom: 10px;
      }
      .sig-name {
        font-weight: 600;
        color: #1a1a2e;
        text-align: center;
        margin-bottom: 4px;
      }
      .sig-date-line {
        border-top: 1px solid #b0b8cc;
        margin-top: 8px;
        padding-top: 8px;
        font-size: 8.5px;
        color: #6b7b94;
        text-align: center;
      }

      /* Stamp box */
      .stamp-box {
        border: 2px dashed ${brandColor}80;
        border-radius: 6px;
        padding: 12px;
        min-height: 95px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: ${brandColor}90;
        font-weight: 700;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.2px;
        background: ${brandColor}08;
      }
      .stamp-box .seal-inner {
        border: 1px dashed ${brandColor}80;
        border-radius: 4px;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Letter-specific styles */
      .letterhead {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid ${brandColor};
        padding-bottom: 12px;
        margin-bottom: 24px;
      }
      .letterhead .org-info h1 {
        margin: 0 0 4px 0;
        font-size: 18px;
        font-weight: 700;
        color: ${brandColor};
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .letterhead .org-info p { margin: 1px 0; color: #5a6a85; font-size: 9.5px; line-height: 1.4; }
      .letterhead .org-logo { max-height: 60px; max-width: 160px; object-fit: contain; }

      .letter-content { font-size: 12px; color: #1a1a2e; line-height: 1.7; }
      .letter-content p { margin-bottom: 14px; text-align: justify; orphans: 3; widows: 3; }
      .letter-content ul { margin: 12px 0 18px 22px; padding: 0; }
      .letter-content li { margin-bottom: 6px; }
      .letter-content h1, .letter-content h2, .letter-content h3, .letter-content h4 {
        color: ${brandColor};
        margin: 16px 0 8px 0;
        page-break-after: avoid;
      }
      .letter-content h1 { font-size: 16px; font-weight: 700; }
      .letter-content h2 { font-size: 14px; font-weight: 700; }
      .letter-content h3, .letter-content h4 { font-size: 12.5px; font-weight: 700; }
      .letter-content table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      .letter-content table th, .letter-content table td { border: 1px solid #d0d8e8; padding: 6px 9px; font-size: 11px; }
      .letter-content table th { background: ${brandColorLight}; color: ${brandColor}; text-align: left; }
      .letter-content a { color: ${brandColor}; text-decoration: none; }
      .letter-content blockquote {
        margin: 12px 0;
        padding: 8px 14px;
        border-left: 3px solid ${brandColor};
        background: ${brandColorLight};
        color: #3a4a64;
      }

      .signatures-container {
        margin-top: 40px;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        page-break-inside: avoid;
      }
      .signature-block { font-size: 11px; line-height: 1.6; }
      .signature-line { width: 200px; border-bottom: 1px solid #9ca8bc; margin-bottom: 10px; height: 45px; }
      .signature-block strong { color: ${brandColor}; display: block; margin-top: 8px; }

      .letter-footer-note {
        margin-top: 30px;
        border-top: 1px solid #d8dfea;
        padding-top: 10px;
        font-size: 8.5px;
        color: #7a8aa3;
        text-align: center;
      }

      /* Utility classes */
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .text-muted { color: #6b7b94; font-size: 9px; }
      .bold { font-weight: 700; }
    `;
  }

  /**
   * Build the professional header element for running header/footer.
   */
  private buildHeaderElement(
    orgName: string,
    orgAddress: string,
    orgContact: string,
    orgLogo: string,
  ): string {
    const hasAddress = orgAddress && orgAddress.trim().length > 0;
    const hasContact = orgContact && orgContact.trim().length > 0;
    return `
      <div class="doc-header">
        <div class="org-info">
          <h1>${orgName}</h1>
          ${hasAddress ? `<p>${orgAddress}</p>` : ''}
          ${hasContact ? `<p>Contact: ${orgContact}</p>` : ''}
        </div>
        ${orgLogo ? `<img src="${orgLogo}" class="org-logo" alt="${orgName} Logo" />` : ''}
      </div>
    `;
  }

  /**
   * Normalize a brand color to a 6-digit hex value (returns null when unusable).
   */
  private sanitizeBrandColor(color?: string | null): string | null {
    if (!color) return null;
    const c = color.trim();
    const shortHex = c.match(/^#([0-9a-fA-F]{3})$/);
    if (shortHex) {
      const s = shortHex[1];
      return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
    const rgb = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
    if (rgb) {
      return `#${rgb
        .slice(1, 4)
        .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
        .join('')}`;
    }
    return null;
  }

  /**
   * Convert a 6-digit hex color to an rgba() string with the given alpha.
   */
  private hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    if ([r, g, b].some((n) => isNaN(n))) return `rgba(30, 58, 95, ${alpha})`;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Fetch a remote image URL and convert it to a base64 data URI so PDF
   * generation never depends on runtime network/CORS (same approach as payslip PDFs).
   */
  private async fetchLogoAsDataUri(url: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 10000 }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          this.fetchLogoAsDataUri(res.headers.location)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Logo fetch failed with status ${res.statusCode}`));
          return;
        }
        const contentType = res.headers['content-type'] || 'image/png';
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const base64 = Buffer.concat(chunks).toString('base64');
          resolve(`data:${contentType};base64,${base64}`);
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Logo fetch timed out'));
      });
    });
  }

  /**
   * Resolve PDF branding (color, logo, footer note) from existing organization
   * configuration: payroll_settings (primaryColor / logoUrl / footerNote)
   * falling back to organizations.logoUrl. Never hardcodes brand values.
   */
  private async getPdfBranding(
    organizationId: string,
    org?: Organization | null,
  ): Promise<{
    brandColor: string;
    logoUrl: string;
    footerNote: string;
    organization: Organization | null;
  }> {
    const [payrollSettings, organization] = await Promise.all([
      this.payrollSettingsRepository.findOne({ where: { organizationId } }),
      org
        ? Promise.resolve(org)
        : this.organizationRepository.findOne({
            where: { id: organizationId },
          }),
    ]);

    const brandColor =
      this.sanitizeBrandColor(payrollSettings?.primaryColor) || '#1e3a5f';

    const logoUrl = payrollSettings?.logoUrl || organization?.logoUrl || '';
    let resolvedLogo = logoUrl;
    if (logoUrl) {
      try {
        resolvedLogo = (await this.fetchLogoAsDataUri(logoUrl)) || logoUrl;
      } catch {
        resolvedLogo = logoUrl;
      }
    }

    return {
      brandColor,
      logoUrl: resolvedLogo,
      footerNote: payrollSettings?.footerNote || '',
      organization: organization || null,
    };
  }

  /**
   * Escape text for safe interpolation into HTML/print templates.
   */
  private escapeHtmlText(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Slim running header used by the print engine on every page (inline styles only).
   */
  private buildPuppeteerHeaderTemplate(
    orgName: string,
    docTitle: string,
    brandColor: string,
  ): string {
    const name = this.escapeHtmlText(orgName);
    const title = this.escapeHtmlText(docTitle);
    return `<div style="width:100%; font-family:Arial,Helvetica,sans-serif; font-size:8px; color:#5a6a85; padding:0 6mm; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid ${brandColor}; padding-bottom:3px; box-sizing:border-box;">
      <span style="text-transform:uppercase; letter-spacing:0.4px; font-weight:700; color:${brandColor};">${name}</span>
      <span style="letter-spacing:0.3px;">${title}</span>
    </div>`;
  }

  /**
   * Slim footer used by the print engine on every page with page numbering
   * (Chromium supports .pageNumber / .totalPages only inside print templates).
   */
  private buildPuppeteerFooterTemplate(
    leftText: string,
    brandColor: string,
  ): string {
    const left = this.escapeHtmlText(leftText);
    return `<div style="width:100%; font-family:Arial,Helvetica,sans-serif; font-size:8px; color:#7a8aa3; padding:0 6mm; display:flex; justify-content:space-between; align-items:center; border-top:1px solid ${brandColor}55; padding-top:3px; box-sizing:border-box;">
      <span style="letter-spacing:0.3px;">${left}</span>
      <span style="font-weight:600; color:#5a6a85;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;
  }

  private createFallbackPdfBuffer(
    title: string,
    sections: { title?: string; lines: string[] }[],
  ): Buffer {
    const streamContent: string[] = [];
    let y = 780;

    const cleanTitle = title.replace(/[\(\)\\]/g, '\\$&');
    streamContent.push(`BT /F1 15 Tf 50 ${y} Td (${cleanTitle}) Tj ET`);
    y -= 25;

    streamContent.push(`0.5 w 50 ${y} m 545 ${y} l S`);
    y -= 20;

    for (const sec of sections) {
      if (y < 80) break;
      if (sec.title) {
        const secTitle = sec.title.replace(/[\(\)\\]/g, '\\$&');
        streamContent.push(`BT /F1 11 Tf 50 ${y} Td (${secTitle}) Tj ET`);
        y -= 16;
      }
      for (const line of sec.lines) {
        if (y < 80) break;
        const escaped = line.replace(/[\(\)\\]/g, '\\$&');
        streamContent.push(`BT /F2 9.5 Tf 50 ${y} Td (${escaped}) Tj ET`);
        y -= 14;
      }
      y -= 10;
    }

    const streamData = streamContent.join('\n');
    const streamLength = Buffer.byteLength(streamData);

    const objects: string[] = [];
    objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
    objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
    objects.push(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj',
    );
    objects.push(
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamData}\nendstream\nendobj`,
    );
    objects.push(
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
    );
    objects.push(
      '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    );

    let pdf = '%PDF-1.4\n';
    const xrefOffsets: number[] = [0];

    for (const obj of objects) {
      xrefOffsets.push(Buffer.byteLength(pdf));
      pdf += obj + '\n';
    }

    const startXref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

    return Buffer.from(pdf, 'utf-8');
  }

  async generateSettlementPdf(
    organizationId: string,
    employeeId: string,
  ): Promise<Buffer> {
    // 1. ENFORCE ASSET CLEARANCE BEFORE DOWNLOADING
    const clearance = await this.getEmployeeClearance(
      organizationId,
      employeeId,
    );
    if (!clearance.isCleared) {
      throw new ForbiddenException({
        message:
          'Final settlement cannot be generated because company assets are still pending return.',
        pendingAssets: clearance.pendingAssets.map((a) => a.assetName),
      });
    }

    const [employee, org, orgSettings, settlementData] = await Promise.all([
      this.employeeRepository.findOne({
        where: { id: employeeId, organizationId },
        relations: ['department', 'designation', 'manager'],
      }),
      this.organizationRepository.findOne({ where: { id: organizationId } }),
      this.orgSettingsRepository.findOne({ where: { organizationId } }),
      this.getEmployeeSettlement(organizationId, employeeId),
    ]);

    if (!employee) throw new NotFoundException('Employee not found');

    const s: any = settlementData.settlement;
    const assets = clearance.assets || [];

    const formatNullableCurrency = (
      val: number | string | undefined | null,
    ) => {
      if (val === null || val === undefined || val === '') return '';
      const num = Number(val);
      if (isNaN(num)) return '';
      return (
        '₹ ' +
        num.toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    };

    const formatNullableDate = (val: any) => {
      if (!val) return '';
      try {
        return DateTime.fromJSDate(new Date(val)).toFormat('dd LLL yyyy');
      } catch (e) {
        return String(val);
      }
    };

    const orgName = org?.organizationName || 'Avinya HRMS Organization';
    const orgAddress = org?.address || (orgSettings as any)?.address || '';
    const orgContact = org?.phone || org?.email || org?.hrMail || '';
    const orgLogo = org?.logoUrl || '';

    const managerName = employee.manager
      ? getFullName(
          employee.manager.firstName,
          employee.manager.middleName,
          employee.manager.lastName,
        )
      : '';

    const clearanceLabel =
      assets.length === 0 ? '✓ NO ASSETS PENDING' : '✓ ALL ASSETS RETURNED';

    const branding = await this.getPdfBranding(organizationId, org);
    const brandColor = branding.brandColor;
    const issuedDate = DateTime.now().toFormat('dd LLL yyyy');
    const footerLeft = branding.footerNote || `${orgName} \u2022 Confidential`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Full & Final Settlement - ${getFullName(employee.firstName, employee.middleName, employee.lastName)}</title>
        <style>
          ${this.buildProfessionalPdfStyles({ brandColor, footerText: footerLeft })}
        </style>
      </head>
      <body>
        ${this.buildHeaderElement(orgName, orgAddress, orgContact, branding.logoUrl || orgLogo)}

        <div class="doc-title-bar">
          <h2>FULL &amp; FINAL SETTLEMENT STATEMENT</h2>
          <div class="text-muted" style="margin-top:4px;">Employee Code: ${employee.employeeCode || '-'} &nbsp;&bull;&nbsp; Issued on ${issuedDate}</div>
        </div>

        <div class="info-grid">
          <div class="info-card">
            <div class="info-card-title">Employee Information</div>
            <table class="info-table">
              <tr><td class="label">Employee Name:</td><td class="value">${getFullName(employee.firstName, employee.middleName, employee.lastName)}</td></tr>
              <tr><td class="label">Employee Code / ID:</td><td class="value">${employee.employeeCode || ''}</td></tr>
              <tr><td class="label">Designation:</td><td class="value">${employee.designation?.name || ''}</td></tr>
              <tr><td class="label">Department:</td><td class="value">${employee.department?.name || ''}</td></tr>
              <tr><td class="label">Reporting Manager:</td><td class="value">${managerName}</td></tr>
              <tr><td class="label">Employment Status:</td><td class="value">${employee.status ? employee.status.toUpperCase() : ''}</td></tr>
            </table>
          </div>

          <div class="info-card">
            <div class="info-card-title">Service &amp; Exit Details</div>
            <table class="info-table">
              <tr><td class="label">Date of Joining:</td><td class="value">${formatNullableDate(employee.dateOfJoining)}</td></tr>
              <tr><td class="label">Resignation Date:</td><td class="value">${formatNullableDate(s.resignationDate)}</td></tr>
              <tr><td class="label">Notice Period:</td><td class="value">${s.noticePeriodDays !== null && s.noticePeriodDays !== undefined && s.noticePeriodDays !== '' ? s.noticePeriodDays + ' Days' : '-'}</td></tr>
              <tr><td class="label">Last Working Date:</td><td class="value">${formatNullableDate(s.lastWorkingDate)}</td></tr>
              <tr><td class="label">Settlement Status:</td><td class="value">${s.status || ''}</td></tr>
              <tr><td class="label">Clearance Status:</td><td class="value"><span class="status-badge cleared">${clearanceLabel}</span></td></tr>
            </table>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <div class="section-title">A. Earnings &amp; Payable Dues</div>
            <table class="data-table">
              <thead>
                <tr><th>Component</th><th class="text-right">Amount (INR)</th></tr>
              </thead>
              <tbody>
                <tr><td>Salary Due for Worked Days</td><td class="text-right">${formatNullableCurrency(s.salaryDue)}</td></tr>
                <tr><td>Pending Salary / Arrears</td><td class="text-right">${formatNullableCurrency(s.pendingSalary)}</td></tr>
                <tr><td>Leave Encashment ${s.leaveEncashmentDays !== null && s.leaveEncashmentDays !== undefined ? '(' + s.leaveEncashmentDays + ' days)' : ''}</td><td class="text-right">${formatNullableCurrency(s.leaveEncashmentAmount)}</td></tr>
                <tr><td>Performance Incentive</td><td class="text-right">${formatNullableCurrency(s.incentiveAmount)}</td></tr>
                <tr><td>Bonus / Ex-Gratia</td><td class="text-right">${formatNullableCurrency(s.bonusAmount)}</td></tr>
                <tr><td>Other Payables / Reimbursements</td><td class="text-right">${formatNullableCurrency(s.otherPayableAmount)}</td></tr>
                <tr class="total-row">
                  <td>Total Gross Earnings (A)</td>
                  <td class="text-right">${formatNullableCurrency(s.totalEarnings)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <div class="section-title">B. Recoveries &amp; Deductions</div>
            <table class="data-table">
              <thead>
                <tr><th>Component</th><th class="text-right">Amount (INR)</th></tr>
              </thead>
              <tbody>
                <tr><td>Notice Period Shortfall Recovery</td><td class="text-right">${formatNullableCurrency(s.noticePeriodRecoveryAmount)}</td></tr>
                <tr><td>Loan / Advance Balance Recovery</td><td class="text-right">${formatNullableCurrency(s.loanRecoveryAmount)}</td></tr>
                <tr><td>Company Asset Loss / Damage</td><td class="text-right">${formatNullableCurrency(s.assetDeductionAmount)}</td></tr>
                <tr><td>Other Statutory / Non-Statutory Deductions</td><td class="text-right">${formatNullableCurrency(s.otherDeductionsAmount)}</td></tr>
                <tr><td class="remarks" colspan="2">${s.deductionsRemarks ? 'Note: ' + s.deductionsRemarks : ''}</td></tr>
                <tr class="total-row">
                  <td>Total Deductions (B)</td>
                  <td class="text-right">${formatNullableCurrency(s.totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="net-banner">
          <div class="label">Net Full &amp; Final Settlement Amount (A - B)</div>
          <div class="amount">${formatNullableCurrency(s.finalSettlementAmount ?? s.netSettlementAmount)}</div>
        </div>

        <div class="section">
          <div class="section-title">Company Assets &amp; Exit Clearance Record</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Asset Name / Description</th>
                <th>Asset Tag / ID</th>
                <th>Issue Date</th>
                <th>Return Date</th>
                <th class="text-center">Clearance Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                assets.length === 0
                  ? '<tr><td colspan="5" class="text-center text-muted">No physical company assets were assigned to this employee.</td></tr>'
                  : assets
                      .map(
                        (a) => `
              <tr>
                <td><strong>${a.assetName}</strong> (${a.assetType})</td>
                <td>${a.assetId || a.serialNumber || ''}</td>
                <td>${formatNullableDate(a.issueDate)}</td>
                <td>${formatNullableDate(a.actualReturnDate)}</td>
                <td class="text-center"><span class="status-badge cleared">Returned &amp; Cleared</span></td>
              </tr>
            `,
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>

        <div class="declaration-box">
          <strong>Employee Declaration:</strong> I hereby acknowledge that the above full and final settlement statement has been thoroughly reviewed and agreed upon by me. I confirm receipt/settlement of all outstanding dues, salary, encashments, and claims from <strong>${orgName}</strong>, and I state that I have returned all company assets, intellectual property, credentials, and documents in good condition. I have no further claims against the organization.
        </div>

        <div class="sig-grid">
          <div class="sig-box">
            <div class="sig-title">Employee Signature</div>
            <div class="sig-name">Name: ${getFullName(employee.firstName, employee.middleName, employee.lastName)}</div>
            <div class="sig-date-line">Date: __________________</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Prepared By (HR)</div>
            <div class="sig-name">Name: ${s.preparedBy || 'HR Operations'}</div>
            <div class="sig-date-line">Date: __________________</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Finance Approval</div>
            <div class="sig-name">Name: ${s.financeApprovalName || 'Finance Head'}</div>
            <div class="sig-date-line">Date: __________________</div>
          </div>
          <div class="stamp-box">
            <div class="seal-inner">Organization Stamp</div>
          </div>
        </div>
      </body>
      </html>
    `;

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchPuppeteerBrowser();
      const page = await browser.newPage();
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.buildPuppeteerHeaderTemplate(
          orgName,
          'Full & Final Settlement Statement',
          brandColor,
        ),
        footerTemplate: this.buildPuppeteerFooterTemplate(
          footerLeft,
          brandColor,
        ),
        margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } catch (error) {
      console.error(
        'Failed to generate full settlement PDF via Puppeteer, falling back to native PDF:',
        error,
      );
      const sections = [
        {
          title: 'Employee Information',
          lines: [
            `Employee Name: ${getFullName(employee.firstName, employee.middleName, employee.lastName)}`,
            `Employee ID: ${employee.employeeCode || ''}`,
            `Designation: ${employee.designation?.name || ''}`,
            `Department: ${employee.department?.name || ''}`,
            `Date of Joining: ${formatNullableDate(employee.dateOfJoining)}`,
            `Last Working Date: ${formatNullableDate(s.lastWorkingDate)}`,
          ],
        },
        {
          title: 'Settlement Dues & Deductions',
          lines: [
            `Total Gross Earnings: ${formatNullableCurrency(s.totalEarnings)}`,
            `Total Deductions: ${formatNullableCurrency(s.totalDeductions)}`,
            `Net Settlement Amount: ${formatNullableCurrency(s.finalSettlementAmount ?? s.netSettlementAmount)}`,
            `Settlement Status: ${s.status || 'DRAFT'}`,
            `Clearance Status: ${clearanceLabel}`,
          ],
        },
      ];
      return this.createFallbackPdfBuffer(
        `FULL & FINAL SETTLEMENT - ${orgName.toUpperCase()}`,
        sections,
      );
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }

  // --- DOCUMENT TEMPLATES & LETTERS ---
  getDefaultTemplateName(type: DocumentTemplateType): string {
    if (type === DocumentTemplateType.EXPERIENCE_LETTER)
      return 'Default Experience Letter';
    if (type === DocumentTemplateType.JOINING_LETTER)
      return 'Default Joining Letter';
    return 'Default Relieving Letter';
  }

  getDefaultTemplateContent(type: DocumentTemplateType): string {
    if (type === DocumentTemplateType.EXPERIENCE_LETTER) {
      return `<p><strong>TO WHOM IT MAY CONCERN</strong></p>
<p><br></p>
<p>This is to certify that <strong>{{employee_name}}</strong> (Employee ID: <strong>{{employee_id}}</strong>) was employed with <strong>{{organization_name}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department from <strong>{{joining_date}}</strong> to <strong>{{last_working_date}}</strong>.</p>
<p><br></p>
<p>During the period of employment spanning <strong>{{experience_duration}}</strong>, {{employee_name}} worked diligently and handled their duties and professional responsibilities with sincere commitment and integrity.</p>
<p><br></p>
<p>During their tenure, we found them to be hard-working, punctual, and professional in all interactions. Their character and conduct were found to be exemplary throughout their service with us.</p>
<p><br></p>
<p>We wish <strong>{{employee_name}}</strong> the very best in all future career endeavors and personal pursuits.</p>
<p><br></p>
<p>Sincerely,</p>
<p><strong>Authorized Signatory</strong><br>{{organization_name}}</p>`;
    }

    if (type === DocumentTemplateType.JOINING_LETTER) {
      return `<p><strong>JOINING LETTER</strong></p>
<p><br></p>
<p>Date: <strong>{{current_date}}</strong></p>
<p><br></p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p><br></p>
<p>We are pleased to confirm your appointment with <strong>{{organization_name}}</strong> as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department. Your date of joining with us is <strong>{{joining_date}}</strong>.</p>
<p><br></p>
<p><strong>Employee Details:</strong></p>
<ul>
  <li><strong>Employee Name:</strong> {{employee_name}}</li>
  <li><strong>Employee ID:</strong> {{employee_id}}</li>
  <li><strong>Designation:</strong> {{designation}}</li>
  <li><strong>Department:</strong> {{department}}</li>
  <li><strong>Date of Joining:</strong> {{joining_date}}</li>
  <li><strong>Reporting Manager:</strong> {{reporting_manager}}</li>
  <li><strong>Work Email:</strong> {{email}}</li>
  <li><strong>Contact Number:</strong> {{phone}}</li>
</ul>
<p><br></p>
<p>Please report to the HR department on your date of joining carrying the original documents for verification. We look forward to a long and successful association with us.</p>
<p><br></p>
<p>Welcome aboard!</p>
<p><br></p>
<p>Sincerely,</p>
<p><strong>Authorized Signatory</strong><br>{{organization_name}}</p>`;
    }

    return `<p><strong>RELIEVING LETTER</strong></p>
<p><br></p>
<p>Date: <strong>{{current_date}}</strong></p>
<p><br></p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p><br></p>
<p>This letter is to formally confirm that you have been relieved from your services and duties as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{organization_name}}</strong>, effective after the close of business hours on <strong>{{last_working_date}}</strong>.</p>
<p><br></p>
<p><strong>Employee Details:</strong></p>
<ul>
  <li><strong>Employee Name:</strong> {{employee_name}}</li>
  <li><strong>Employee ID:</strong> {{employee_id}}</li>
  <li><strong>Designation:</strong> {{designation}}</li>
  <li><strong>Department:</strong> {{department}}</li>
  <li><strong>Date of Joining:</strong> {{joining_date}}</li>
  <li><strong>Date of Relieving:</strong> {{last_working_date}}</li>
  <li><strong>Total Experience:</strong> {{experience_duration}}</li>
</ul>
<p><br></p>
<p>We confirm that you have returned all company property and completed all handover and exit formalities in a satisfactory manner. The management appreciates your contributions and dedication during your tenure with the organization.</p>
<p><br></p>
<p>We wish you all the best and continued success in your future career endeavors.</p>
<p><br></p>
<p>Sincerely,</p>
<p><strong>Authorized Signatory</strong><br>{{organization_name}}</p>`;
  }

  async getDocumentTemplates(organizationId: string) {
    const templates = await this.templateRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });

    const types = [
      DocumentTemplateType.EXPERIENCE_LETTER,
      DocumentTemplateType.RELIEVING_LETTER,
      DocumentTemplateType.JOINING_LETTER,
    ];

    const result = [];
    for (const type of types) {
      let existing = templates.find((t) => t.templateType === type);
      if (!existing) {
        existing = this.templateRepository.create({
          organizationId,
          templateType: type,
          templateName: this.getDefaultTemplateName(type),
          content: this.getDefaultTemplateContent(type),
          isActive: true,
        });
        existing = await this.templateRepository.save(existing);
      }
      result.push(existing);
    }

    return result;
  }

  async getDocumentTemplateByType(
    organizationId: string,
    type: DocumentTemplateType,
  ) {
    let template = await this.templateRepository.findOne({
      where: { organizationId, templateType: type },
    });

    if (!template) {
      template = this.templateRepository.create({
        organizationId,
        templateType: type,
        templateName: this.getDefaultTemplateName(type),
        content: this.getDefaultTemplateContent(type),
        isActive: true,
      });
      template = await this.templateRepository.save(template);
    }

    return template;
  }

  async saveDocumentTemplate(
    organizationId: string,
    dto: CreateDocumentTemplateDto,
    userId?: string,
  ) {
    let template = await this.templateRepository.findOne({
      where: { organizationId, templateType: dto.templateType },
    });

    if (template) {
      template.templateName = dto.templateName;
      template.content = dto.content;
      if (dto.isActive !== undefined) template.isActive = dto.isActive;
      template.updatedBy = userId || null;
    } else {
      template = this.templateRepository.create({
        organizationId,
        templateType: dto.templateType,
        templateName: dto.templateName,
        content: dto.content,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
    }

    return this.templateRepository.save(template);
  }

  async updateDocumentTemplate(
    organizationId: string,
    id: string,
    dto: UpdateDocumentTemplateDto,
    userId?: string,
  ) {
    const template = await this.templateRepository.findOne({
      where: { id, organizationId },
    });
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    if (dto.templateName !== undefined)
      template.templateName = dto.templateName;
    if (dto.content !== undefined) template.content = dto.content;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    template.updatedBy = userId || null;

    return this.templateRepository.save(template);
  }

  async resetDocumentTemplate(
    organizationId: string,
    type: DocumentTemplateType,
    userId?: string,
  ) {
    let template = await this.templateRepository.findOne({
      where: { organizationId, templateType: type },
    });

    const defaultContent = this.getDefaultTemplateContent(type);
    const defaultName = this.getDefaultTemplateName(type);

    if (template) {
      template.templateName = defaultName;
      template.content = defaultContent;
      template.isActive = true;
      template.updatedBy = userId || null;
    } else {
      template = this.templateRepository.create({
        organizationId,
        templateType: type,
        templateName: defaultName,
        content: defaultContent,
        isActive: true,
        createdBy: userId || null,
      });
    }

    return this.templateRepository.save(template);
  }

  calculateExperience(
    joiningDate?: Date | string | null,
    lastWorkingDate?: Date | string | null,
  ) {
    if (!joiningDate) {
      return {
        experienceDuration: '',
        experienceYears: '',
        experienceMonths: '',
        experienceDays: '',
        experience: '',
      };
    }

    const start = DateTime.fromJSDate(new Date(joiningDate));
    const end = lastWorkingDate
      ? DateTime.fromJSDate(new Date(lastWorkingDate))
      : DateTime.now();

    if (!start.isValid || !end.isValid || end < start) {
      return {
        experienceDuration: '',
        experienceYears: '',
        experienceMonths: '',
        experienceDays: '',
        experience: '',
      };
    }

    const diff = end.diff(start, ['years', 'months', 'days']).toObject();
    const years = Math.max(0, Math.floor(diff.years || 0));
    const months = Math.max(0, Math.floor(diff.months || 0));
    const days = Math.max(0, Math.floor(diff.days || 0));

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'Year' : 'Years'}`);
    if (months > 0)
      parts.push(`${months} ${months === 1 ? 'Month' : 'Months'}`);
    if (days > 0 || parts.length === 0)
      parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);

    const duration = parts.join(' ');

    return {
      experienceDuration: duration,
      experience: duration,
      experienceYears:
        years > 0 ? `${years} ${years === 1 ? 'Year' : 'Years'}` : '',
      experienceMonths:
        months > 0 ? `${months} ${months === 1 ? 'Month' : 'Months'}` : '',
      experienceDays: days > 0 ? `${days} ${days === 1 ? 'Day' : 'Days'}` : '',
    };
  }

  resolveTemplateVariables(
    content: string,
    employee: any,
    org: any,
    orgSettings: any,
    settlementData?: any,
  ): string {
    const s = settlementData?.settlement || {};
    const formatNullableCurrency = (val: any) => {
      if (val === null || val === undefined || val === '') return '';
      const num = Number(val);
      if (isNaN(num)) return '';
      return (
        '₹ ' +
        num.toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    };

    const formatDate = (val: any) => {
      if (!val) return '';
      try {
        return DateTime.fromJSDate(new Date(val)).toFormat('dd LLL yyyy');
      } catch (e) {
        return String(val);
      }
    };

    const lastWorkDate = s.lastWorkingDate || employee.dateOfExit || null;
    const exp = this.calculateExperience(employee.dateOfJoining, lastWorkDate);

    const managerName = employee.manager
      ? getFullName(
          employee.manager.firstName,
          employee.manager.middleName,
          employee.manager.lastName,
        )
      : '';

    const orgName = org?.organizationName || 'Avinya HRMS Organization';
    const orgAddress = org?.address || orgSettings?.address || '';
    const orgPhone = org?.phone || '';
    const orgEmail = org?.email || org?.hrMail || '';
    const orgLogo = org?.logoUrl || '';

    const variables: Record<string, string> = {
      // Employee variables
      '{{employee_name}}': getFullName(
        employee.firstName,
        employee.middleName,
        employee.lastName,
      ),
      '{{employee_id}}': employee.employeeCode || '',
      '{{employee_code}}': employee.employeeCode || '',
      '{{designation}}': employee.designation?.name || '',
      '{{department}}': employee.department?.name || '',
      '{{email}}':
        employee.workEmail ||
        employee.personalEmail ||
        employee.user?.email ||
        '',
      '{{phone}}': employee.contactNumber || employee.user?.mobileNumber || '',
      '{{joining_date}}': formatDate(employee.dateOfJoining),
      '{{last_working_date}}': formatDate(lastWorkDate),
      '{{resignation_date}}': formatDate(s.resignationDate),
      '{{reporting_manager}}': managerName,
      '{{primary_manager}}': managerName,

      // Experience variables
      '{{experience}}': exp.experience,
      '{{experience_duration}}': exp.experienceDuration,
      '{{experience_years}}': exp.experienceYears,
      '{{experience_months}}': exp.experienceMonths,
      '{{experience_days}}': exp.experienceDays,

      // Organization variables
      '{{organization_name}}': orgName,
      '{{organization_address}}': orgAddress,
      '{{organization_phone}}': orgPhone,
      '{{organization_email}}': orgEmail,
      '{{organization_logo}}': orgLogo
        ? `<img src="${orgLogo}" alt="${orgName}" style="max-height:50px;" />`
        : '',

      // Settlement variables
      '{{salary_due}}': formatNullableCurrency(s.salaryDue),
      '{{pending_salary}}': formatNullableCurrency(s.pendingSalary),
      '{{leave_encashment}}': formatNullableCurrency(s.leaveEncashmentAmount),
      '{{bonus}}': formatNullableCurrency(s.bonusAmount),
      '{{performance_incentive}}': formatNullableCurrency(s.incentiveAmount),
      '{{other_payables}}': formatNullableCurrency(s.otherPayableAmount),
      '{{total_earnings}}': formatNullableCurrency(s.totalEarnings),
      '{{notice_period_recovery}}': formatNullableCurrency(
        s.noticePeriodRecoveryAmount,
      ),
      '{{loan_recovery}}': formatNullableCurrency(s.loanRecoveryAmount),
      '{{asset_deduction}}': formatNullableCurrency(s.assetDeductionAmount),
      '{{other_deductions}}': formatNullableCurrency(s.otherDeductionsAmount),
      '{{total_deductions}}': formatNullableCurrency(s.totalDeductions),
      '{{final_settlement_amount}}': formatNullableCurrency(
        s.finalSettlementAmount ?? s.netSettlementAmount,
      ),

      // Date variables
      '{{current_date}}': DateTime.now().toFormat('dd LLL yyyy'),
      '{{generation_date}}': DateTime.now().toFormat('dd LLL yyyy'),
    };

    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(key.replace(/([{}])/g, '\\$1'), 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  async previewLetter(
    organizationId: string,
    employeeId: string,
    dto: PreviewLetterDto,
  ) {
    const [employee, org, orgSettings, settlementData] = await Promise.all([
      this.employeeRepository.findOne({
        where: { id: employeeId, organizationId },
        relations: ['department', 'designation', 'manager'],
      }),
      this.organizationRepository.findOne({ where: { id: organizationId } }),
      this.orgSettingsRepository.findOne({ where: { organizationId } }),
      this.getEmployeeSettlement(organizationId, employeeId),
    ]);

    if (!employee) throw new NotFoundException('Employee not found');

    let rawContent = dto.customContent;
    let templateName = '';

    if (!rawContent) {
      let template: EmployeeDocumentTemplate | null = null;
      if (dto.templateId) {
        template = await this.templateRepository.findOne({
          where: { id: dto.templateId, organizationId },
        });
      }
      if (!template) {
        template = await this.getDocumentTemplateByType(
          organizationId,
          dto.templateType,
        );
      }
      rawContent =
        template?.content || this.getDefaultTemplateContent(dto.templateType);
      templateName = template?.templateName || '';
    }

    const renderedHtml = this.resolveTemplateVariables(
      rawContent,
      employee,
      org,
      orgSettings,
      settlementData,
    );

    const exp = this.calculateExperience(
      employee.dateOfJoining,
      settlementData?.settlement?.lastWorkingDate || employee.dateOfExit,
    );

    return {
      templateType: dto.templateType,
      templateName,
      renderedHtml,
      employee: {
        id: employee.id,
        name: getFullName(
          employee.firstName,
          employee.middleName,
          employee.lastName,
        ),
        employeeCode: employee.employeeCode,
        designation: employee.designation?.name || '',
        department: employee.department?.name || '',
        dateOfJoining: employee.dateOfJoining,
        lastWorkingDate:
          settlementData?.settlement?.lastWorkingDate ||
          employee.dateOfExit ||
          null,
        experienceDuration: exp.experienceDuration,
      },
      organization: {
        name: org?.organizationName || 'Avinya HRMS Organization',
        address: org?.address || (orgSettings as any)?.address || '',
        logoUrl: org?.logoUrl || '',
      },
    };
  }

  async generateLetterPdf(
    organizationId: string,
    employeeId: string,
    type: DocumentTemplateType,
    customContent?: string,
  ): Promise<Buffer> {
    const preview = await this.previewLetter(organizationId, employeeId, {
      templateType: type,
      customContent,
    });

    const org = preview.organization;
    const emp = preview.employee;

    const branding = await this.getPdfBranding(organizationId);
    const brandColor = branding.brandColor;
    const orgName = org.name;
    const orgAddress = org.address || '';
    const orgContact =
      branding.organization?.phone ||
      branding.organization?.email ||
      branding.organization?.hrMail ||
      '';
    const issuedDate = DateTime.now().toFormat('dd LLL yyyy');
    const footerNote = branding.footerNote || '';
    const footerLeft = branding.footerNote || `${orgName} - System Generated`;
    const docTitleText =
      type === DocumentTemplateType.EXPERIENCE_LETTER
        ? 'Experience Certificate'
        : type === DocumentTemplateType.JOINING_LETTER
          ? 'Joining Letter'
          : 'Relieving Letter';

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${docTitleText} - ${emp.name}</title>
        <style>
          ${this.buildProfessionalPdfStyles({ brandColor, footerText: footerLeft })}
        </style>
      </head>
      <body>
        ${this.buildHeaderElement(orgName, orgAddress, orgContact, branding.logoUrl || org.logoUrl || '')}

        <div class="letter-content">
          ${preview.renderedHtml}
        </div>

        <div class="signatures-container">
          <div class="signature-block">
            <div class="signature-line"></div>
            <strong>Authorized Signatory</strong>
            ${orgName}
            <div class="text-muted" style="margin-top:6px;">Date: __________________</div>
          </div>
          <div class="stamp-box">
            <div class="seal-inner">Official Stamp</div>
          </div>
        </div>

        <div class="letter-footer-note">
          This document is system-generated on ${issuedDate} by ${orgName}.
          ${footerNote ? '<div style="margin-top:3px;">' + footerNote + '</div>' : ''}
        </div>
      </body>
      </html>
    `;

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await this.launchPuppeteerBrowser();
      const page = await browser.newPage();
      await page.setContent(fullHtml, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.buildPuppeteerHeaderTemplate(
          orgName,
          docTitleText,
          brandColor,
        ),
        footerTemplate: this.buildPuppeteerFooterTemplate(
          footerLeft,
          brandColor,
        ),
        margin: { top: '14mm', bottom: '14mm', left: '16mm', right: '16mm' },
      });
      return Buffer.from(pdf);
    } catch (error) {
      console.error(
        `Failed to generate ${type} PDF via Puppeteer, falling back to native PDF:`,
        error,
      );
      const docTitle =
        type === DocumentTemplateType.EXPERIENCE_LETTER
          ? 'EXPERIENCE CERTIFICATE'
          : type === DocumentTemplateType.JOINING_LETTER
            ? 'JOINING LETTER'
            : 'RELIEVING LETTER';
      const lines = this.stripHtmlToLines(preview.renderedHtml);
      return this.createFallbackPdfBuffer(`${org.name} - ${docTitle}`, [
        { lines },
      ]);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }

  // --- PROJECT ASSIGNMENTS CRUD ---
  async getEmployeeAssignedProjects(
    organizationId: string,
    employeeId: string,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
      select: ['id', 'userId'],
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }
    if (!employee.userId) {
      return [];
    }

    const userId = employee.userId;
    const [internalMembers, clientMembers] = await Promise.all([
      this.projectMemberRepository.find({
        where: { userId, project: { organizationId } },
        relations: ['project'],
        order: { assignedAt: 'DESC' },
      }),
      this.clientProjectMemberRepository.find({
        where: { userId, project: { organizationId } },
        relations: ['project'],
        order: { assignedAt: 'DESC' },
      }),
    ]);

    const emp = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
      select: ['id'],
      relations: ['designation'],
    });
    const designation = emp?.designation?.name ?? null;

    const internal = internalMembers.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      source: 'internal',
      name: m.project?.name || '',
      role: m.role,
      designation,
      assignedAt: m.assignedAt,
    }));

    const client = clientMembers.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      source: 'client',
      name: m.project?.projectName || '',
      role: m.role,
      designation,
      assignedAt: m.assignedAt,
    }));

    return internal.concat(client);
  }

  async getProjectAssignments(organizationId: string, employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const assignments = await this.assignmentRepository.find({
      where: { organizationId, employeeId },
      order: { createdAt: 'ASC' },
    });

    const projectIds = assignments.map((a) => a.projectId).filter(Boolean);
    const managerIds = assignments.map((a) => a.managerId).filter(Boolean);

    const [internalProjects, clientProjects, managers] = await Promise.all([
      projectIds.length
        ? this.projectRepository.find({
            where: { id: In(projectIds), organizationId },
            select: ['id', 'name', 'status'],
          })
        : [],
      projectIds.length
        ? this.clientProjectRepository.find({
            where: { id: In(projectIds), organizationId },
            select: ['id', 'projectName', 'projectCode', 'status'],
          })
        : [],
      managerIds.length
        ? this.employeeRepository.find({
            where: { id: In(managerIds), organizationId },
            relations: ['designation'],
            select: [
              'id',
              'firstName',
              'lastName',
              'workEmail',
              'photoUrl',
              'passportPhotoUrl',
              'status',
              'employeeCode',
            ],
          })
        : [],
    ]);

    const projectMap = new Map<string, any>();
    for (const p of internalProjects) {
      projectMap.set(`internal:${p.id}`, { ...p, source: 'internal' });
      projectMap.set(p.id, { ...p, source: 'internal' });
    }
    for (const cp of clientProjects) {
      const obj = {
        id: cp.id,
        name: cp.projectName,
        code: cp.projectCode,
        status: cp.status,
        source: 'client',
      };
      projectMap.set(`client:${cp.id}`, obj);
      if (!projectMap.has(cp.id)) {
        projectMap.set(cp.id, obj);
      }
    }

    const managerMap = new Map<string, any>();
    for (const m of managers) {
      const signedPhoto = await this.signIfNeeded(this.getProfilePhotoKey(m));
      managerMap.set(m.id, {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        workEmail: m.workEmail,
        employeeCode: m.employeeCode,
        photoUrl: signedPhoto,
        status: m.status,
        isActive: m.status === 'active',
      });
    }

    return assignments.map((a) => {
      const projKey = `${a.projectSource || 'internal'}:${a.projectId}`;
      const project = projectMap.get(projKey) ||
        projectMap.get(a.projectId) || {
          id: a.projectId,
          name: 'Project',
          source: a.projectSource || 'internal',
        };
      const manager = a.managerId ? managerMap.get(a.managerId) || null : null;
      return {
        id: a.id,
        employeeId: a.employeeId,
        projectId: a.projectId,
        projectSource: a.projectSource || 'internal',
        managerId: a.managerId,
        managerType:
          a.managerType ||
          (a.managerId === employee.reportingTo ? 'PRIMARY' : 'SECONDARY'),
        role: a.role || 'member',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        project,
        manager,
      };
    });
  }

  async assignProject(
    organizationId: string,
    employeeId: string,
    dto: {
      projectId: string;
      projectSource?: 'internal' | 'client';
      managerId?: string;
      managerType?: 'PRIMARY' | 'SECONDARY';
      role?: string;
    },
  ) {
    const {
      projectId,
      projectSource = 'internal',
      managerId,
      managerType,
      role = 'member',
    } = dto;

    // 1. Employee must exist
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) {
      throw new NotFoundException(
        `Employee with ID ${employeeId} not found in this organization`,
      );
    }

    const { projectName } = await this.resolveAssignmentProject(
      organizationId,
      projectId,
      projectSource,
    );

    // 3. Manager must exist and be ACTIVE
    if (managerId) {
      const manager = await this.employeeRepository.findOne({
        where: { id: managerId, organizationId },
      });
      if (!manager) {
        throw new BadRequestException(
          `Manager with ID ${managerId} not found in this organization`,
        );
      }
      if (manager.status !== 'active') {
        throw new BadRequestException(
          `Cannot assign inactive employee (${getFullName(manager.firstName, manager.middleName, manager.lastName)}) as manager`,
        );
      }
      if (manager.id === employeeId) {
        throw new BadRequestException(
          'Employee cannot be assigned as their own manager',
        );
      }
    }

    // 4. Check duplicate assignment (employee_id + project_id + project_source)
    const existing = await this.assignmentRepository.findOne({
      where: {
        organizationId,
        employeeId,
        projectId,
        projectSource,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Employee is already assigned to this project (${projectName})`,
      );
    }

    // 5. Determine managerType
    const mType =
      managerType ||
      (managerId && managerId === employee.reportingTo
        ? 'PRIMARY'
        : 'SECONDARY');

    // 6. Create assignment
    const assignment = this.assignmentRepository.create({
      organizationId,
      employeeId,
      projectId,
      projectSource,
      managerId: managerId || null,
      managerType: mType,
      role: role || 'member',
    });

    await this.assignmentRepository.save(assignment);

    // Sync with project members table if needed
    try {
      if (projectSource === 'client' && employee.userId) {
        const existingMember = await this.clientProjectMemberRepository.findOne(
          {
            where: { projectId, userId: employee.userId },
          },
        );
        if (!existingMember) {
          await this.clientProjectMemberRepository.save(
            this.clientProjectMemberRepository.create({
              projectId,
              userId: employee.userId,
              role: role || 'member',
            }),
          );
        }
      } else if (employee.userId) {
        const existingMember = await this.projectMemberRepository.findOne({
          where: { projectId, userId: employee.userId },
        });
        if (!existingMember) {
          await this.projectMemberRepository.save(
            this.projectMemberRepository.create({
              projectId,
              userId: employee.userId,
              role: role || 'member',
            }),
          );
        }
      }
    } catch (e) {
      console.warn('Could not sync project member row:', e);
    }

    await this.invalidateEmployeeCache(organizationId, employeeId);

    return this.getProjectAssignments(organizationId, employeeId);
  }

  async updateProjectAssignment(
    organizationId: string,
    employeeId: string,
    assignmentId: string,
    dto: {
      projectId?: string;
      projectSource?: 'internal' | 'client';
      managerId?: string | null;
      managerType?: 'PRIMARY' | 'SECONDARY';
      role?: string;
    },
  ) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId, organizationId, employeeId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Project assignment with ID ${assignmentId} not found`,
      );
    }

    if (dto.managerId !== undefined) {
      if (dto.managerId) {
        const manager = await this.employeeRepository.findOne({
          where: { id: dto.managerId, organizationId },
        });
        if (!manager) {
          throw new BadRequestException(
            `Manager with ID ${dto.managerId} not found`,
          );
        }
        if (manager.status !== 'active') {
          throw new BadRequestException(
            `Cannot assign inactive employee (${getFullName(manager.firstName, manager.middleName, manager.lastName)}) as manager`,
          );
        }
        if (manager.id === employeeId) {
          throw new BadRequestException(
            'Employee cannot be assigned as their own manager',
          );
        }
        assignment.managerId = dto.managerId;
      } else {
        assignment.managerId = null;
      }
    }

    if (dto.managerType) {
      assignment.managerType = dto.managerType;
    }

    if (dto.projectId !== undefined || dto.projectSource !== undefined) {
      const newProjectId = dto.projectId || assignment.projectId;
      const newSource = dto.projectSource || assignment.projectSource;

      await this.resolveAssignmentProject(
        organizationId,
        newProjectId,
        newSource,
      );

      const dup = await this.assignmentRepository.findOne({
        where: {
          organizationId,
          employeeId,
          projectId: newProjectId,
          projectSource: newSource,
        },
      });
      if (dup && dup.id !== assignmentId) {
        throw new ConflictException(
          'Employee is already assigned to this project',
        );
      }
      assignment.projectId = newProjectId;
      assignment.projectSource = newSource;
    }

    if (dto.role) {
      assignment.role = dto.role;
    }

    await this.assignmentRepository.save(assignment);
    await this.invalidateEmployeeCache(organizationId, employeeId);

    return this.getProjectAssignments(organizationId, employeeId);
  }

  async removeProjectAssignment(
    organizationId: string,
    employeeId: string,
    assignmentId: string,
  ) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId, organizationId, employeeId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Project assignment with ID ${assignmentId} not found`,
      );
    }

    await this.assignmentRepository.remove(assignment);
    await this.invalidateEmployeeCache(organizationId, employeeId);

    return {
      success: true,
      message: 'Project assignment removed successfully',
    };
  }

  private async resolveAssignmentProject(
    organizationId: string,
    projectId: string,
    projectSource: EmployeeProjectSource,
  ): Promise<{ projectName: string }> {
    if (!['internal', 'client'].includes(projectSource)) {
      throw new BadRequestException(
        `Invalid project_source "${projectSource}". Expected "internal" or "client"`,
      );
    }

    if (projectSource === 'client') {
      const project = await this.clientProjectRepository.findOne({
        where: { id: projectId, organizationId },
      });
      if (project) return { projectName: project.projectName };
    } else {
      const project = await this.projectRepository.findOne({
        where: { id: projectId, organizationId },
      });
      if (project) return { projectName: project.name };
    }

    throw new BadRequestException(
      `Project with ID ${projectId} not found in this organization for source "${projectSource}"`,
    );
  }

  // --- CACHE INVALIDATION HELPER ---
  private async invalidateEmployeeCache(
    organizationId: string,
    employeeId?: string,
  ) {
    try {
      // Invalidate employee list caches for the organization
      await Promise.all([
        this.cacheManager.del(`${CACHE_KEYS.EMPLOYEES}:${organizationId}`),
        this.cacheManager.del(
          `${CACHE_KEYS.EMPLOYEES}:${organizationId}:active`,
        ),
        this.cacheManager.del(
          `${CACHE_KEYS.EMPLOYEES}:${organizationId}:inactive`,
        ),
        this.cacheManager.del(`${CACHE_KEYS.EMPLOYEES}:${organizationId}:all`),
        this.cacheManager.del(`managers:${organizationId}`),
        this.cacheManager.del(
          `${CACHE_KEYS.DASHBOARD_STATS}:${organizationId}`,
        ),
      ]);

      if (employeeId) {
        await this.cacheManager.del(`${CACHE_KEYS.EMPLOYEE}:${employeeId}`);
      }
      console.log(
        '🗑️ Invalidated all employee caches for org:',
        organizationId,
      );
    } catch (error) {
      console.error('❌ Error invalidating cache:', error);
    }
  }

  private async signIfNeeded(key?: string | null): Promise<string | null> {
    if (!key) return null;
    // Skip signing if it is already a full URL (http/https/gs) or a data URI
    if (/^(https?:)?\/\//i.test(key)) return key;
    if (key.startsWith('data:')) return key;
    try {
      return await this.storageService.getSignedUrl(key);
    } catch (e) {
      return null;
    }
  }

  private getProfilePhotoKey(
    employee?: Pick<Employee, 'passportPhotoUrl' | 'photoUrl'> | null,
  ) {
    if (!employee) return null;
    return employee.passportPhotoUrl || employee.photoUrl || null;
  }

  private async addSignedProfilePhoto<
    T extends { passportPhotoUrl?: string | null; photoUrl?: string | null },
  >(
    entity: T,
  ): Promise<
    T & {
      photoUrl: string | null;
      passportPhotoUrl?: string | null;
      profileImage?: string | null;
    }
  > {
    const primaryKey = this.getProfilePhotoKey(entity as any);
    const primarySigned = await this.signIfNeeded(primaryKey);
    const passportSigned = await this.signIfNeeded(entity.passportPhotoUrl);
    const photoSigned = await this.signIfNeeded(entity.photoUrl);

    return {
      ...entity,
      passportPhotoUrl: passportSigned ?? entity.passportPhotoUrl ?? null,
      photoUrl: primarySigned ?? passportSigned ?? photoSigned ?? null,
      profileImage: primarySigned ?? passportSigned ?? photoSigned ?? null,
    };
  }
}
