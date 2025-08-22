import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateUserDto } from '../auth-core/dto/create-user.dto';
import { Role } from '../auth-core/entities/role.entity';
import { UsersService } from '../auth-core/services/users.service';
import { Attendance } from '../attendance/entities/attendance.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,

    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,

    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    private readonly userService: UsersService,
    private readonly entityManager: EntityManager,
  ) {}

  async create(dto: CreateEmployeeDto) {
    const userDto: CreateUserDto = {
      userName: dto.employeeCode,
      password: 'Ab@2025',
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName ?? '',
      email: dto.workEmail,
      mobileNumber: dto.contactNumber ?? '',
      dob: dto.dateOfBirth,
      gender: dto.gender,
      organizationId: dto.organizationId,
    };

    const createdUser = await this.userService.create(userDto);

    const role = await this.roleRepository.findOne({
      where: { roleName: 'EMPLOYEE' },
    });

    if (!role) throw new NotFoundException('Default Employee role not found');

    const userRole = this.userRoleRepository.create({
      user: createdUser,
      role: role,
    });

    await this.userRoleRepository.save(userRole);

    const employee = this.employeeRepository.create({
      ...dto,
      userId: createdUser.id,
    });

    return this.employeeRepository.save(employee);
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    return this.employeeRepository.findOne({
      where: { userId },
      relations: ['user', 'organization', 'department', 'designation', 'manager'],
    });
  }

  findAll(organizationId: string) {
    return this.employeeRepository.find({
      where: { organizationId },
      relations: ['department', 'designation', 'manager'],
      order: { firstName: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'designation', 'manager'],
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.employeeRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string) {
    const employee = await this.employeeRepository.findOne({ where: { id } });

    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }

    return this.employeeRepository.remove(employee);
  }

  // --- CORRECTED DASHBOARD STATS ---
  async getDashboardStats(organizationId: string) {
    try {
      console.log('🚀 Getting dashboard stats for organization:', organizationId);

      // Get today's date as string (YYYY-MM-DD format for attendanceDate comparison)
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // Format: "2025-08-20"

      const totalEmployees = await this.employeeRepository.count({
        where: { organizationId: organizationId },
      });

      console.log('👥 Total employees:', totalEmployees);

      // ✅ FIXED: Query attendance using attendanceDate (string) and organization_id
      const todaysAttendances = await this.entityManager
        .createQueryBuilder(Attendance, 'attendance')
        .where('attendance.organization_id = :organizationId', { organizationId })
        .andWhere('attendance.attendanceDate = :todayStr', { todayStr })
        .getMany();

      console.log('📊 Today\'s attendances found:', todaysAttendances.length);

      const presentToday = todaysAttendances.filter(
        (a) => a.status === 'present',
      ).length;

      const halfDay = todaysAttendances.filter(
        (a) => a.status === 'half-day',
      ).length;

      console.log('✅ Present today:', presentToday, 'Half day:', halfDay);

      // ✅ FIXED: Query leave requests using proper field names
      // Note: You'll need to verify the exact field structure for LeaveRequest
      const onLeaveToday = await this.entityManager
        .createQueryBuilder(LeaveRequest, 'leave')
        .leftJoin('leave.user', 'user')
        .where('user.organizationId = :organizationId', { organizationId })
        .andWhere('leave.status = :status', { status: 'approved' })
        .andWhere('leave.startDate <= :todayStr', { todayStr })
        .andWhere('leave.endDate >= :todayStr', { todayStr })
        .getCount();

      const pendingLeaveRequests = await this.entityManager
        .createQueryBuilder(LeaveRequest, 'leave')
        .leftJoin('leave.user', 'user')
        .where('user.organizationId = :organizationId', { organizationId })
        .andWhere('leave.status = :status', { status: 'pending' })
        .getCount();

      console.log('🏖️ On leave today:', onLeaveToday, 'Pending requests:', pendingLeaveRequests);

      const absent = Math.max(0, totalEmployees - presentToday - halfDay - onLeaveToday);

      const result = {
        totalEmployees: { value: totalEmployees, change: 0 },
        presentToday: { value: presentToday, change: 0 },
        onLeaveToday: { value: onLeaveToday, change: 0 },
        pendingLeaveRequests: { value: pendingLeaveRequests, change: 0 },
        attendanceBreakdown: {
          present: presentToday,
          halfDay: halfDay,
          absent: absent,
        },
      };

      console.log('📈 Final dashboard stats:', result);
      return result;

    } catch (error) {
      console.error('❌ Error in getDashboardStats:', error);
      throw error;
    }
  }
}
