import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingPlan } from './entities/pricing-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PricingPlanSeederService } from './pricing-plan-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([PricingPlan, Subscription])],
  controllers: [PricingController],
  providers: [PricingService, PricingPlanSeederService],
  exports: [PricingService],
})
export class PricingModule {}
