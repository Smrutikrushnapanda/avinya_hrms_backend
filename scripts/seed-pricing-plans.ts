import { DataSource } from 'typeorm';
import dataSource from '../src/config/typeorm.config';
import { PricingPlan } from '../src/modules/pricing/entities/pricing-plan.entity';
import { DEFAULT_PRICING_PLANS } from '../src/modules/pricing/default-pricing-plans';

async function seedPricingPlans() {
  const source = new DataSource(dataSource.options);

  try {
    await source.initialize();

    const pricingPlanRepository = source.getRepository(PricingPlan);

    await pricingPlanRepository.upsert(DEFAULT_PRICING_PLANS, ['planType']);
    console.log('✅ Pricing plans seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding pricing plans:', error);
    process.exit(1);
  } finally {
    await source.destroy();
  }
}

void seedPricingPlans();
