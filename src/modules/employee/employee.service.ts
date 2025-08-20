import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Between } from 'typeorm';
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
    // ... (rest of the file is correct)
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

  // --- DashBoard Stats ---
  async getDashboardStats(organizationId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const totalEmployees = await this.employeeRepository.count({
      where: { organizationId: organizationId },
    });

    const todaysAttendances = await this.entityManager
      .createQueryBuilder(Attendance, 'attendance')
      .leftJoin('attendance.organization', 'org')
      .where('org.id = :organizationId', { organizationId })
      .andWhere('attendance.date >= :today', { today })
      .andWhere('attendance.date < :tomorrow', { tomorrow })
      .getMany();

    const presentToday = todaysAttendances.filter(
      (a) => a.status === 'present',
    ).length;

    const onLeaveToday = await this.entityManager
      .createQueryBuilder(LeaveRequest, 'leave')
      .leftJoin('leave.organization', 'org')
      .where('org.id = :organizationId', { organizationId })
      .andWhere('leave.status = :status', { status: 'approved' })
      .andWhere('leave.startDate <= :today', { today })
      .andWhere('leave.endDate >= :today', { today })
      .getCount();

    const pendingLeaveRequests = await this.entityManager
      .createQueryBuilder(LeaveRequest, 'leave')
      .leftJoin('leave.organization', 'org')
      .where('org.id = :organizationId', { organizationId })
      .andWhere('leave.status = :status', { status: 'pending' })
      .getCount();

    const halfDay = todaysAttendances.filter(
      (a) => a.status === 'half-day',
    ).length;

    const absent = totalEmployees - presentToday - halfDay;

    return {
      totalEmployees: { value: totalEmployees, change: 0 },
      presentToday: { value: presentToday, change: 0 },
      onLeaveToday: { value: onLeaveToday, change: 0 },
      pendingLeaveRequests: { value: pendingLeaveRequests, change: 0 },
      attendanceBreakdown: {
        present: presentToday,
        halfDay: halfDay,
        absent: absent > 0 ? absent : 0,
      },
    };
  }
}