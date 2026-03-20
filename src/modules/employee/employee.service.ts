import { BadRequestException, ConflictException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, MoreThan, QueryFailedError } from 'typeorm';
import { Cache } from 'cache-manager';
import { Employee } from './entities/employee.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
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
import { StorageService } from '../attendance/storage.service';
import { ResignationRequest } from '../resignation/entities/resignation-request.entity';
import { WorkflowAssignment } from '../workflow/entities/workflow-assignment.entity';
import { Timesheet } from '../workflow/timesheet/entities/timesheet.entity';
import { Timeslip } from '../workflow/timeslip/entities/timeslip.entity';
import { MailService } from '../mail/mail.service';
import { DateTime } from 'luxon';

// Cache key constants
const CACHE_KEYS = {
  EMPLOYEES: 'employees',
  EMPLOYEE: 'employee',
  DASHBOARD_STATS: 'dashboard-stats',
  ANALYTICS: 'employee-analytics',
  BIRTHDAYS: 'employee-birthdays',
};

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeProfile)
    private readonly employeeProfileRepository: Repository<EmployeeProfile>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

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

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    private readonly userService: UsersService,
    private readonly entityManager: EntityManager,
    private readonly leaveService: LeaveService,
    private readonly wfhService: WfhService,
    private readonly storageService: StorageService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateEmployeeDto) {
    try {
      if (!dto.loginUserName?.trim() || !dto.loginPassword?.trim()) {
        throw new BadRequestException('loginUserName and loginPassword are required');
      }

      const { loginUserName: rawLoginUserName, loginPassword, roleId, ...employeePayload } = dto;
      const loginUserName = rawLoginUserName.trim();
      const selectedRole = await this.resolveRoleForEmployee(
        dto.organizationId,
        roleId,
      );

      const existingUser = await this.userRepository.findOne({
        where: [
          { email: dto.workEmail },
          { userName: loginUserName },
          ...(dto.contactNumber ? [{ mobileNumber: dto.contactNumber }] : []),
        ],
      });

      const userDto: CreateUserDto = {
        userName: loginUserName,
        password: loginPassword,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName ?? '',
        email: dto.workEmail,
        mobileNumber: dto.contactNumber ?? undefined,
        dob: dto.dateOfBirth,
        gender: dto.gender,
        organizationId: dto.organizationId,
      };

      if (existingUser) {
        const existingByUserName = await this.userRepository.findOne({
          where: { userName: loginUserName },
        });
        if (existingByUserName && existingByUserName.id !== existingUser.id) {
          throw new ConflictException('Username already in use');
        }

        existingUser.userName = loginUserName;
        existingUser.password = await bcrypt.hash(loginPassword, 12);
        existingUser.mustChangePassword = true;
        await this.userRepository.save(existingUser);

        const existingEmployee = await this.employeeRepository.findOne({
          where: { userId: existingUser.id },
        });

        if (existingEmployee) {
          throw new ConflictException('Employee already exists for this user');
        }

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
          employeeName: [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || dto.firstName,
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
        employeeName: [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || dto.firstName,
        userName: loginUserName,
        password: loginPassword,
        reason: 'created',
      });
      
      return this.findOne(savedEmployee.id);
    } catch (error) {
      if (error instanceof QueryFailedError && (error as any).code === '23505') {
        throw new ConflictException('Employee already exists with provided unique details');
      }
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<any | null> {
    const employee = await this.employeeRepository.findOne({
      where: { userId },
      relations: ['user', 'organization', 'department', 'designation', 'manager'],
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

    return {
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
  }

  findAll(organizationId: string) {
    const cacheKey = `${CACHE_KEYS.EMPLOYEES}:${organizationId}`;
    
    return this.cacheManager.get(cacheKey).then(async (cached) => {
      if (cached) {
        console.log('📦 Returning cached employees for org:', organizationId);
        return cached;
      }
      
      const emps = await this.employeeRepository.find({
        where: { organizationId },
        relations: ['department', 'designation', 'manager', 'user', 'branch'],
        order: { firstName: 'ASC' },
      });
      
      // Use Promise.all for parallel photo signing
      const employees = await Promise.all(
        emps.map((e) => this.addSignedProfilePhoto(e))
      );
      
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
      relations: ['department', 'designation', 'manager', 'user', 'branch'],
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
    
    // Cache for 10 minutes
    await this.cacheManager.set(cacheKey, result, 600);
    
    return result;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const { loginUserName, loginPassword, roleId, ...employeeUpdate } =
      dto as any;

    if (Object.keys(employeeUpdate).length > 0) {
      await this.employeeRepository.update(id, employeeUpdate);
    }
    const employee = await this.findOne(id);

    let credentialsUpdated = false;
    let effectiveUserName = '';

    if (loginUserName || loginPassword) {
      const user = await this.userRepository.findOne({ where: { id: employee.userId } });
      if (!user) {
        throw new NotFoundException(`User for employee ${id} not found`);
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
        user.mustChangePassword = true;
        credentialsUpdated = true;
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
        [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() ||
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
      const reportingEmployees = await this.employeeRepository.find({ where: { reportingTo: id } });

      // Set their manager to null and save them
      for (const reportingEmployee of reportingEmployees) {
        reportingEmployee.reportingTo = null;
        await this.employeeRepository.save(reportingEmployee);
      }

      // Clean up related records before deleting the employee
      
      // 1. Delete resignation requests for this employee
      await this.resignationRepository.delete({ employeeId: id });
      await this.resignationRepository.delete({ employeeUserId: employee.userId });
      
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
      console.log('🚀 Getting enhanced dashboard stats for organization:', organizationId);

      const nowIst = DateTime.now().setZone('Asia/Kolkata');
      const todayStr = nowIst.toFormat('yyyy-MM-dd');
      const lastMonthStart = nowIst.minus({ months: 1 }).startOf('month').toFormat('yyyy-MM-dd');
      const thisMonthStart = nowIst.startOf('month').toFormat('yyyy-MM-dd');
      const thisMonthPayPeriod = nowIst.toFormat('yyyy-MM');

      // Single consolidated query — uses only 1 connection instead of 9
      const [row] = await this.entityManager.query(`
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
              COUNT(*) FILTER (WHERE status = 'present') AS present_today,
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
      `, [organizationId, thisMonthStart, lastMonthStart, todayStr, thisMonthPayPeriod]);

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

      const absent = Math.max(0, activeEmployees - presentToday - halfDay - onLeaveToday);
      const newJoinersChange = newJoinersLastMonth > 0
        ? Math.round(((newJoinersThisMonth - newJoinersLastMonth) / newJoinersLastMonth) * 100)
        : newJoinersThisMonth > 0 ? 100 : 0;

      const result = {
        totalEmployees: { value: totalEmployees, change: 0 },
        activeEmployees: { value: activeEmployees, change: 0 },
        presentToday: { value: presentToday, change: 0 },
        onLeaveToday: { value: onLeaveToday, change: 0 },
        pendingLeaveRequests: { value: pendingLeaveRequests, change: 0 },
        payrollDue: { value: payrollDue, change: 0 },
        newJoinersThisMonth: { value: newJoinersThisMonth, change: newJoinersChange },
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
        status: 'active'
      },
      relations: ['department'],
      select: [
        'id', 'firstName', 'lastName', 'dateOfBirth',
        'photoUrl', 'passportPhotoUrl', 'workEmail'
      ],
    });

    // Filter employees with birthdays in the next N days
    const upcomingBirthdays = employees
      .filter(employee => employee.dateOfBirth)
      .map(employee => {
        const birthDate = new Date(employee.dateOfBirth);
        const thisYear = today.getFullYear();
        const birthdayThisYear = new Date(thisYear, birthDate.getMonth(), birthDate.getDate());
        
        // If birthday already passed this year, check next year
        if (birthdayThisYear < today) {
          birthdayThisYear.setFullYear(thisYear + 1);
        }
        
        const daysUntil = Math.ceil((birthdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          ...employee,
          daysUntilBirthday: daysUntil,
          upcomingBirthdayDate: birthdayThisYear,
        };
      })
      .filter(employee => employee.daysUntilBirthday <= days && employee.daysUntilBirthday >= 0)
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
      .leftJoinAndSelect('employee.user', 'user')
      .where('employee.organizationId = :organizationId', { organizationId });

    // Add status filter
    if (status !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.status = :status', { status });
    }

    // Add department filter
    if (department !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.departmentId = :departmentId', { departmentId: department });
    }

    // Add designation filter
    if (designation !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.designationId = :designationId', { designationId: designation });
    }

    // Add branch filter
    if (branch && branch !== 'all') {
      queryBuilder = queryBuilder.andWhere('employee.branchId = :branchId', { branchId: branch });
    }

    // Add join date filter
    if (joinDateFilter !== 'all') {
      const now = new Date();
      switch (joinDateFilter) {
        case 'last30':
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          queryBuilder = queryBuilder.andWhere('employee.dateOfJoining > :thirtyDaysAgo', { thirtyDaysAgo });
          break;
        case 'last90':
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          queryBuilder = queryBuilder.andWhere('employee.dateOfJoining > :ninetyDaysAgo', { ninetyDaysAgo });
          break;
        case 'thisYear':
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          const endOfYear = new Date(now.getFullYear(), 11, 31);
          queryBuilder = queryBuilder.andWhere('employee.dateOfJoining BETWEEN :startOfYear AND :endOfYear', {
            startOfYear,
            endOfYear,
          });
          break;
      }
    }

    // Add search filter
    if (search && search.trim()) {
      queryBuilder = queryBuilder.andWhere(
        '(employee.firstName ILIKE :search OR employee.lastName ILIKE :search OR employee.workEmail ILIKE :search OR employee.employeeCode ILIKE :search)',
        { search: `%${search.trim()}%` }
      );
    }

    // Add sorting
    const sortColumn = sortBy === 'department' ? 'department.name' :
                      sortBy === 'designation' ? 'designation.name' :
                      sortBy === 'manager' ? 'manager.firstName' :
                      sortBy === 'branch' ? 'branch.name' :
                      `employee.${sortBy}`;
    
    queryBuilder = queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

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
      // Get employees who can be managers (active employees with leadership roles or seniority)
      const managers = await this.employeeRepository.find({
        where: { 
          organizationId,
          status: 'active',
        },
        relations: ['designation', 'department'],
        order: { firstName: 'ASC' },
        select: ['id', 'firstName', 'lastName', 'employeeCode', 'workEmail'],
      });

      // Filter for potential managers based on designation or experience
      const potentialManagers = managers.filter(emp => {
        const designation = emp.designation?.name?.toLowerCase() || '';
        return (
          designation.includes('manager') ||
          designation.includes('lead') ||
          designation.includes('head') ||
          designation.includes('director') ||
          designation.includes('senior') ||
          designation.includes('supervisor')
        );
      });

      // If no designated managers found, return all employees who can potentially manage
      return potentialManagers.length > 0 ? potentialManagers : managers.slice(0, 20); // Limit to 20 for performance
    } catch (error) {
      console.error('Error finding managers:', error);
      return [];
    }
  }

  async getBranchesForOrg(organizationId: string) {
    return this.branchRepository.find({
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
          'id', 'firstName', 'lastName', 'employeeCode',
          'dateOfJoining', 'photoUrl', 'passportPhotoUrl', 'workEmail'
        ],
      });

      console.log(`📅 Found ${recentJoiners.length} recent joiners in last ${days} days`);
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
          'COUNT(CASE WHEN employee.status = \'active\' THEN 1 END) as activeEmployees',
          'COUNT(CASE WHEN employee.status = \'inactive\' THEN 1 END) as inactiveEmployees',
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
        this.entityManager.query(`
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
        `, [organizationId]),

        // Gender distribution
        this.entityManager.query(`
          SELECT 
            COALESCE(gender, 'Not Specified') as gender,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND status = 'active'
          GROUP BY gender
          ORDER BY count DESC
        `, [organizationId]),

        // Employment type distribution
        this.entityManager.query(`
          SELECT 
            COALESCE(employment_type, 'Not Specified') as employment_type,
            COUNT(*) as count
          FROM employees 
          WHERE organization_id = $1 AND status = 'active'
          GROUP BY employment_type
          ORDER BY count DESC
        `, [organizationId]),

        // Tenure distribution
        this.entityManager.query(`
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
        `, [organizationId]),
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
  async bulkUpdateEmployees(employeeIds: string[], updateData: Partial<UpdateEmployeeDto>) {
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
  async getEmployeeSearchSuggestions(organizationId: string, query: string, limit: number = 5) {
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
          'designation.name'
        ])
        .where('employee.organizationId = :organizationId', { organizationId })
        .andWhere('employee.status = :status', { status: 'active' })
        .andWhere(
          '(employee.firstName ILIKE :query OR employee.lastName ILIKE :query OR employee.employeeCode ILIKE :query)',
          { query: `%${query.trim()}%` }
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

  // --- NEW: VALIDATE EMPLOYEE DATA ---
  async validateEmployeeData(employeeData: Partial<CreateEmployeeDto | UpdateEmployeeDto>, employeeId?: string) {
    const errors: string[] = [];

    try {
      // Check for duplicate employee code
      if (employeeData.employeeCode) {
        const existingEmployee = await this.employeeRepository.findOne({
          where: { employeeCode: employeeData.employeeCode },
        });

        if (existingEmployee && existingEmployee.id !== employeeId) {
          errors.push('Employee code already exists');
        }
      }

      // Check for duplicate work email
      if (employeeData.workEmail) {
        const existingEmployee = await this.employeeRepository.findOne({
          where: { workEmail: employeeData.workEmail },
        });

        if (existingEmployee && existingEmployee.id !== employeeId) {
          errors.push('Work email already exists');
        }
      }

      // Validate reporting structure (no circular references)
      if (employeeData.reportingTo && employeeId) {
        const isCircular = await this.checkCircularReporting(employeeId, employeeData.reportingTo);
        if (isCircular) {
          errors.push('Circular reporting structure detected');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      console.error('Error validating employee data:', error);
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
  private async checkCircularReporting(employeeId: string, managerId: string): Promise<boolean> {
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

  // --- CACHE INVALIDATION HELPER ---
  private async invalidateEmployeeCache(organizationId: string, employeeId?: string) {
    try {
      // Invalidate employee list cache for the organization
      const orgCacheKey = `${CACHE_KEYS.EMPLOYEES}:${organizationId}`;
      await this.cacheManager.del(orgCacheKey);
      console.log('🗑️ Invalidated employee list cache for org:', organizationId);

      // Invalidate specific employee cache if provided
      if (employeeId) {
        const empCacheKey = `${CACHE_KEYS.EMPLOYEE}:${employeeId}`;
        await this.cacheManager.del(empCacheKey);
        console.log('🗑️ Invalidated employee cache:', employeeId);
      }

      // Invalidate dashboard stats cache
      const statsCacheKey = `${CACHE_KEYS.DASHBOARD_STATS}:${organizationId}`;
      await this.cacheManager.del(statsCacheKey);
      console.log('🗑️ Invalidated dashboard stats cache for org:', organizationId);
    } catch (error) {
      console.error('❌ Error invalidating cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the operation
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

  private getProfilePhotoKey(employee?: Pick<Employee, 'passportPhotoUrl' | 'photoUrl'> | null) {
    if (!employee) return null;
    return employee.passportPhotoUrl || employee.photoUrl || null;
  }

  private async addSignedProfilePhoto<
    T extends { passportPhotoUrl?: string | null; photoUrl?: string | null }
  >(entity: T): Promise<
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
