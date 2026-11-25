import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Designation } from './entities/designation.entity';
import { Department } from './entities/department.entity';
import { Employee } from './entities/employee.entity';
import {
  CreateDesignationDto,
  UpdateDesignationDto,
} from './dto/department-designation.dto';

@Injectable()
export class DesignationService {
  constructor(
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
  ) {}

  async findAll(
    organizationId: string,
    departmentId?: string,
  ): Promise<Designation[]> {
    return this.designationRepository.find({
      where: { organizationId, ...(departmentId ? { departmentId } : {}) },
      relations: ['department'],
      order: { name: 'ASC' },
    });
  }

  private async validateDepartment(
    organizationId: string,
    departmentId: string,
  ) {
    if (
      !departmentId ||
      !(await this.designationRepository.manager
        .getRepository(Department)
        .existsBy({ id: departmentId, organizationId }))
    ) {
      throw new BadRequestException(
        'Select a department from your organization',
      );
    }
  }

  async create(
    data: CreateDesignationDto & { organizationId: string },
  ): Promise<Designation> {
    await this.validateDepartment(data.organizationId, data.departmentId);
    const designation = this.designationRepository.create(data);
    return this.designationRepository.save(designation);
  }

  async update(
    id: string,
    data: UpdateDesignationDto,
    organizationId: string,
  ): Promise<Designation> {
    const designation = await this.designationRepository.findOne({
      where: { id, organizationId },
    });
    if (!designation) {
      throw new NotFoundException(`Designation with ID ${id} not found`);
    }
    if (data.departmentId !== undefined) {
      await this.validateDepartment(organizationId, data.departmentId);
    }
    Object.assign(designation, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.departmentId !== undefined
        ? { departmentId: data.departmentId }
        : {}),
    });
    return this.designationRepository.save(designation);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const designation = await this.designationRepository.findOne({
      where: { id, organizationId },
    });
    if (!designation) throw new NotFoundException('Designation not found');
    if (
      await this.designationRepository.manager
        .getRepository(Employee)
        .existsBy({ designationId: id })
    ) {
      throw new ConflictException(
        'Designation is assigned to employees and cannot be deleted',
      );
    }
    await this.designationRepository.delete({ id, organizationId });
  }
}
