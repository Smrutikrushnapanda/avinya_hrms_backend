import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { CreateOrganizationDto, UpdateOrganizationDto } from '../dto/organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async create(data: CreateOrganizationDto, createdBy: string) {
    const org = this.orgRepo.create({
      ...data,
      createdBy,
      updatedBy: createdBy,
    });
    return this.orgRepo.save(org);
  }

  async update(id: string, data: UpdateOrganizationDto, updatedBy: string) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    
    // Map frontend field 'name' to entity field 'organizationName'
    if (data.name) {
      data.organizationName = data.name;
    }
    
    // Map the new fields
    if (data.email !== undefined) org.email = data.email;
    if (data.phone !== undefined) org.phone = data.phone;
    if (data.address !== undefined) org.address = data.address;
    
    Object.assign(org, data, { updatedBy });
    return this.orgRepo.save(org);
  }

  async findAll() {
    return this.orgRepo.find();
  }

  async findOne(id: string) {
    const org = await this.orgRepo.findOne({
      where: { id },
      relations: ['users', 'organizationFeatures'],
    });
    if (!org) throw new NotFoundException('Organization not found');
    // Map organizationName to name for frontend compatibility
    return {
      ...org,
      name: org.organizationName,
    };
  }
}
