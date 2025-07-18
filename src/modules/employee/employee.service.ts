import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  create(dto: CreateEmployeeDto) {
    const employee = this.employeeRepository.create(dto);
    return this.employeeRepository.save(employee);
  }

  async findByUserId(userId: string): Promise<Employee | null> {
    return this.employeeRepository.findOne({
      where: { userId },
      relations: [
        'user',
        'organization',
        'department',
        'designation',
      ],
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
