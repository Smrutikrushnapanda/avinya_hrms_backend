import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Designation } from './entities/designation.entity';

@Injectable()
export class DesignationService {
  constructor(
    @InjectRepository(Designation)
    private readonly designationRepository: Repository<Designation>,
  ) {}

  async findAll(organizationId: string): Promise<Designation[]> {
    return this.designationRepository.find({
      where: { organizationId },
      order: { name: 'ASC' },
    });
  }

  async create(data: { name: string; code: string; organizationId: string }): Promise<Designation> {
    const designation = this.designationRepository.create(data);
    return this.designationRepository.save(designation);
  }

  async update(id: string, data: { name?: string; code?: string }): Promise<Designation> {
    await this.designationRepository.update(id, data);
    const designation = await this.designationRepository.findOne({ where: { id } });
    if (!designation) {
      throw new NotFoundException(`Designation with ID ${id} not found`);
    }
    return designation;
  }

  async remove(id: string): Promise<void> {
    await this.designationRepository.delete(id);
  }
}
