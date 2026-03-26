import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingType } from '../entities/pricing-type.entity';

const DEFAULT_PRICING_TYPES: Array<Partial<PricingType>> = [
  {
    typeId: 1,
    typeName: 'Basic',
    price: '299.00',
    currency: 'INR',
    billingModel: 'MONTHLY',
    isCustomPricing: false,
    description:
      'Attendance-focused plan with basic admin web, employee web, and limited mobile navigation.',
  },
  {
    typeId: 2,
    typeName: 'Pro Launch',
    price: '499.00',
    currency: 'INR',
    billingModel: 'MONTHLY',
    isCustomPricing: false,
    description:
      'Full-featured HRMS plan across admin web, employee web, and mobile.',
  },
  {
    typeId: 3,
    typeName: 'Enterprise',
    price: null,
    currency: 'INR',
    billingModel: 'CUSTOM_QUOTE',
    isCustomPricing: true,
    description:
      'Enterprise plan with dedicated database, priority support, and custom rollout scope.',
  },
];

@Injectable()
export class PricingTypeSeederService implements OnModuleInit {
  private readonly logger = new Logger(PricingTypeSeederService.name);

  constructor(
    @InjectRepository(PricingType)
    private readonly pricingTypeRepo: Repository<PricingType>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    await this.pricingTypeRepo.upsert(DEFAULT_PRICING_TYPES, ['typeId']);
    this.logger.log('Pricing types ensured: Basic, Pro Launch, Enterprise.');
  }
}
