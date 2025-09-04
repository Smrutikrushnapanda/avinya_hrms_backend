import { Injectable } from '@nestjs/common';
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
}
