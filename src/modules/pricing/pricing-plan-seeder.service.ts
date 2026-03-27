import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingPlan } from './entities/pricing-plan.entity';
import { DEFAULT_PRICING_PLANS } from './default-pricing-plans';

@Injectable()
export class PricingPlanSeederService implements OnModuleInit {
  private readonly logger = new Logger(PricingPlanSeederService.name);

  constructor(
    @InjectRepository(PricingPlan)
    private readonly pricingPlanRepository: Repository<PricingPlan>,
  ) {}

  async onModuleInit() {
    await this.pricingPlanRepository.upsert(DEFAULT_PRICING_PLANS, ['planType']);
    this.logger.log('Pricing plans ensured: Basic, Pro Launch, Enterprise.');
  }
}
