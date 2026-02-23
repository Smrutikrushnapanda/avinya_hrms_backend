import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Between, LessThanOrEqual, MoreThanOrEqual, Like, MoreThan, QueryFailedError } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateUserDto } from '../auth-core/dto/create-user.dto';
import { Role } from '../auth-core/entities/role.entity';
import { RoleType } from '../auth-core/enums/role-type.enum';
import { UsersService } from '../auth-core/services/users.service';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { User } from '../auth-core/entities/user.entity';
import { LeaveService } from '../leave/leave.service';
import { WfhService } from '../wfh/wfh.service';
import * as bcrypt from 'bcrypt';
import { Branch } from '../attendance/entities/branch.entity';
import { StorageService } from '../attendance/storage.service';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,

    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly userService: UsersService,
    private readonly entityManager: EntityManager,
    private readonly leaveService: LeaveService,
    private readonly wfhService: WfhService,
    private readonly storageService: StorageService,
  ) {}

  async create(dto: CreateEmployeeDto) {
    try {
      if (!dto.loginUserName?.trim() || !dto.loginPassword?.trim()) {
        throw new BadRequestException('loginUserName and loginPassword are required');
      }

      const loginUserName = dto.loginUserName.trim();

      const existingUser = await this.userRepository.findOne({
        where: [
          { email: dto.workEmail },
          { userName: loginUserName },
          ...(dto.contactNumber ? [{ mobileNumber: dto.contactNumber }] : []),
        ],
      });

      const userDto: CreateUserDto = {
        userName: loginUserName,
        password: dto.loginPassword,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName ?? '',
        email: dto.workEmail,
        mobileNumber: dto.contactNumber ?? undefined,
        dob: dto.dateOfBirth,
        gender: dto.gender,
        organizationId: dto.organizationId,
      };

      let role = await this.roleRepository.findOne({
        where: { roleName: 'EMPLOYEE' },
      });

      if (!role) {
        role = await this.roleRepository.save(
          this.roleRepository.create({
            roleName: 'EMPLOYEE',
            type: RoleType.DEFAULT,
            description: 'Default Employee role',
            createdBy: 'system',
          }),
        );
      }

      if (existingUser) {
        const existingEmployee = await this.employeeRepository.findOne({
          where: { userId: existingUser.id },
        });

        if (existingEmployee) {
          throw new ConflictException('Employee already exists for this user');
        }

        const existingUserRole = await this.userRoleRepository.findOne({
          where: { user: { id: existingUser.id }, role: { id: role.id } },
        });

        if (!existingUserRole) {
          const userRole = this.userRoleRepository.create({
            user: existingUser,
            role,
          });
          await this.userRoleRepository.save(userRole);
        }

        const employee = this.employeeRepository.create({
          ...dto,
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
        return savedEmployee;
      }

      const createdUser = await this.userService.create(userDto);

      const userRole = this.userRoleRepository.create({
        user: createdUser,
        role: role,
      });

      await this.userRoleRepository.save(userRole);

      const employee = this.employeeRepository.create({
        ...dto,
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
      return savedEmployee;
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
    const managerPhotoUrl = await this.signIfNeeded(
      this.getProfilePhotoKey(employee.manager as any),
    );

    return {
      ...employee,
      photoUrl,
      manager: employee.manager
        ? { ...employee.manager, photoUrl: managerPhotoUrl }
        : employee.manager,
    };
  }

  findAll(organizationId: string) {
    return this.employeeRepository
      .find({
        where: { organizationId },
        relations: ['department', 'designation', 'manager', 'user', 'branch'],
        order: { firstName: 'ASC' },
      })
      .then((emps) => Promise.all(emps.map((e) => this.addSignedProfilePhoto(e))));
  }

  async findOne(id: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'designation', 'manager', 'user', 'branch'],
    });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    const photoUrl = await this.signIfNeeded(this.getProfilePhotoKey(employee));
    const managerPhotoUrl = await this.signIfNeeded(
      this.getProfilePhotoKey(employee.manager as any),
    );

    return {
      ...(employee as any),
      userName: (employee as any)?.user?.userName,
      photoUrl,
      manager: employee.manager
        ? { ...employee.manager, photoUrl: managerPhotoUrl }
        : employee.manager,
    };
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const { loginUserName, loginPassword, ...employeeUpdate } = dto as any;

    await this.employeeRepository.update(id, employeeUpdate);
    const employee = await this.findOne(id);

    if (loginUserName || loginPassword) {
      const user = await this.userRepository.findOne({ where: { id: employee.userId } });
      if (!user) {
        throw new NotFoundException(`User for employee ${id} not found`);
      }

      if (loginUserName) {
        const existing = await this.userRepository.findOne({
          where: { userName: loginUserName },
        });
        if (existing && existing.id !== user.id) {
          throw new ConflictException('Username already in use');
        }
        user.userName = loginUserName;
      }

      if (loginPassword) {
        user.password = await bcrypt.hash(loginPassword, 12);
      }

      await this.userRepository.save(user);
    }

    return employee;
  }

  async remove(id: string) {
    const employee = await this.employeeRepository.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return this.employeeRepository.remove(employee);
  }

  // --- ENHANCED DASHBOARD STATS ---
  async getDashboardStats(organizationId: string) {
    try {
      console.log('🚀 Getting enhanced dashboard stats for organization:', organizationId);
      
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      // Parallel queries for performance
      const [
        totalEmployees,
        activeEmployees,
        newJoinersThisMonth,
        newJoinersLastMonth,
        todaysAttendances,
        onLeaveToday,
        pendingLeaveRequests,
        departmentCount,
        designationCount
      ] = await Promise.all([
        this.employeeRepository.count({ where: { organizationId } }),
        this.employeeRepository.count({ where: { organizationId, status: 'active' } }),
        this.employeeRepository.count({
          where: { 
            organizationId, 
            dateOfJoining: MoreThan(thisMonthStart) 
          }
        }),
        this.employeeRepository.count({
          where: { 
            organizationId, 
            dateOfJoining: Between(lastMonthStart, thisMonthStart) 
          }
        }),
        this.entityManager
          .createQueryBuilder(Attendance, 'attendance')
          .where('attendance.organization_id = :organizationId', { organizationId })
          .andWhere('attendance.attendanceDate = :todayStr', { todayStr })
          .getMany(),
        this.entityManager
          .createQueryBuilder(LeaveRequest, 'leave')
          .leftJoin('leave.user', 'user')
          .where('user.organizationId = :organizationId', { organizationId })
          .andWhere('leave.status = :status', { status: 'approved' })
          .andWhere('leave.startDate <= :todayStr', { todayStr })
          .andWhere('leave.endDate >= :todayStr', { todayStr })
          .getCount(),
        this.entityManager
          .createQueryBuilder(LeaveRequest, 'leave')
          .leftJoin('leave.user', 'user')
          .where('user.organizationId = :organizationId', { organizationId })
          .andWhere('leave.status = :status', { status: 'pending' })
          .getCount(),
        this.entityManager.query(
          'SELECT COUNT(DISTINCT department_id) FROM employees WHERE organization_id = $1 AND department_id IS NOT NULL',
          [organizationId]
        ),
        this.entityManager.query(
          'SELECT COUNT(DISTINCT designation_id) FROM employees WHERE organization_id = $1 AND designation_id IS NOT NULL',
          [organizationId]
        )
      ]);

      const presentToday = todaysAttendances.filter(a => a.status === 'present').length;
      const halfDay = todaysAttendances.filter(a => a.status === 'half-day').length;
      const absent = Math.max(0, activeEmployees - presentToday - halfDay - onLeaveToday);

      // Calculate changes
      const newJoinersChange = newJoinersLastMonth > 0 
        ? Math.round(((newJoinersThisMonth - newJoinersLastMonth) / newJoinersLastMonth) * 100)
        : newJoinersThisMonth > 0 ? 100 : 0;

      const result = {
        totalEmployees: { value: totalEmployees, change: 0 },
        activeEmployees: { value: activeEmployees, change: 0 },
        presentToday: { value: presentToday, change: 0 },
        onLeaveToday: { value: onLeaveToday, change: 0 },
        pendingLeaveRequests: { value: pendingLeaveRequests, change: 0 },
        newJoinersThisMonth: { value: newJoinersThisMonth, change: newJoinersChange },
        departments: { value: departmentCount[0]?.count || 0, change: 0 },
        designations: { value: designationCount?.count || 0, change: 0 },
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

    // Attach username for edit UI + signed profile photo
    const employeesWithUserName = await Promise.all(
      employees.map(async (emp: any) => {
        const withPhoto = await this.addSignedProfilePhoto(emp);
        return {
          ...withPhoto,
          userName: emp?.user?.userName,
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
