import { SetMetadata } from '@nestjs/common';
import { PlanType } from '../entities/pricing-plan.entity';

export const REQUIRED_PLAN_TYPES_KEY = 'pricing:required-plan-types';

export const RequirePlanTypes = (...planTypes: PlanType[]) =>
  SetMetadata(REQUIRED_PLAN_TYPES_KEY, planTypes);

export const RequireProPlan = () =>
  RequirePlanTypes(PlanType.PRO, PlanType.ENTERPRISE);
