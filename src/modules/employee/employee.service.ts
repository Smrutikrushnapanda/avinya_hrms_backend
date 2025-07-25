import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { CreateUserDto } from '../auth-core/dto/create-user.dto';
import { Role } from '../auth-core/entities/role.entity';
import { UsersService } from '../auth-core/services/users.service';

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
  ) {}

  async create(dto: CreateEmployeeDto) {
    // 1. Create the user from employee fields
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

    // 2. Assign "employee" role (fetch by slug or name)
    const role = await this.roleRepository.findOne({
      where: { roleName: 'EMPLOYEE' },
    });

    if (!role) throw new NotFoundException('Default Employee role not found');

    const userRole = this.userRoleRepository.create({
      user: createdUser,
      role: role,
    });

    await this.userRoleRepository.save(userRole);

    // 3. Create the employee using created user ID
    const employee = this.employeeRepository.create({
      ...dto,
      userId: createdUser.id,
    });

    return this.employeeRepository.save(employee);
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    return this.employeeRepository.findOne({
      where: { userId },
      relations: ['user', 'organization', 'department', 'designation'],
    });
  }

  findAll(organizationId: string) {
    return this.employeeRepository.find({
      where: { organizationId },
      relations: ['department', 'designation', 'reportingTo'],
      order: { firstName: 'ASC' },
    });
  }

  findOne(id: string) {
    return this.employeeRepository.findOne({
      where: { id },
      relations: ['department', 'designation', 'reportingTo'],
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
}
