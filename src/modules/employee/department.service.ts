import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { Employee } from './entities/employee.entity';

// Export the interface so it can be used in controller
export interface DepartmentStatistics {
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  employeeCount: number;
  activeEmployeeCount: number;
}

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async findAll(organizationId: string): Promise<Department[]> {
    return this.departmentRepository.find({
      where: { organizationId },
      order: { name: 'ASC' },
    });
  }

  async getStatistics(organizationId: string): Promise<DepartmentStatistics[]> {
    const departments = await this.departmentRepository.find({
      where: { organizationId },
      order: { name: 'ASC' },
    });

    const statistics: DepartmentStatistics[] = [];

    for (const department of departments) {
      const totalEmployees = await this.employeeRepository.count({
        where: {
          organizationId,
          departmentId: department.id,
        },
      });

      const activeEmployees = await this.employeeRepository.count({
        where: {
          organizationId,
          departmentId: department.id,
          status: 'active',
        },
      });

      statistics.push({
        departmentId: department.id,
        departmentName: department.name,
        departmentCode: department.code,
        employeeCount: totalEmployees,
        activeEmployeeCount: activeEmployees,
      });
    }

    return statistics;
  }
}
