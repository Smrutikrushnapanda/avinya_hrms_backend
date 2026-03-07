import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyPolicy } from './entities/company-policy.entity';
import { CreatePolicyDto } from './dto/create-policy.dto';

@Injectable()
export class PolicyService {
  constructor(
    @InjectRepository(CompanyPolicy)
    private policyRepo: Repository<CompanyPolicy>,
  ) {}

  async create(orgId: string, userId: string, dto: CreatePolicyDto) {
    const policy = this.policyRepo.create({
      organization: { id: orgId },
      createdBy: { id: userId },
      title: dto.title,
      content: dto.content,
      category: dto.category,
      isActive: dto.isActive ?? true,
    });
    return this.policyRepo.save(policy);
  }

  async findAll(orgId: string) {
    return this.policyRepo.find({
      where: { organization: { id: orgId }, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, orgId: string) {
    const policy = await this.policyRepo.findOne({
      where: { id, organization: { id: orgId } },
    });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async update(id: string, orgId: string, dto: Partial<CreatePolicyDto>) {
    const policy = await this.findOne(id, orgId);
    Object.assign(policy, dto);
    return this.policyRepo.save(policy);
  }

  async remove(id: string, orgId: string) {
    const policy = await this.findOne(id, orgId);
    policy.isActive = false;
    await this.policyRepo.save(policy);
    return { success: true };
  }
}
