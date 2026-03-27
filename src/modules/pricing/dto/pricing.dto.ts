import {
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsArray,
  IsEmail,
  IsObject,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';
import {
  PlanType,
  PlanFeature,
  IncludedFeatures,
} from '../entities/pricing-plan.entity';
import { SubscriptionStatus } from '../entities/subscription.entity';

// Pricing Plan DTOs
export class CreatePricingPlanDto {
  @IsEnum(PlanType)
  planType!: PlanType;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  displayPrice?: string;

  @IsOptional()
  @IsArray()
  features?: PlanFeature[];

  @IsOptional()
  @IsObject()
  includedFeatures?: IncludedFeatures;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  supportLevel?: string;

  @IsOptional()
  @IsBoolean()
  customizable?: boolean;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export class UpdatePricingPlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  displayPrice?: string;

  @IsOptional()
  @IsArray()
  features?: PlanFeature[];

  @IsOptional()
  @IsObject()
  includedFeatures?: IncludedFeatures;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  supportLevel?: string;

  @IsOptional()
  @IsBoolean()
  customizable?: boolean;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;
}

export class PricingPlanDto {
  id!: string;
  planType!: PlanType;
  name!: string;
  description!: string | null;
  price!: number;
  displayPrice!: string | null;
  features!: PlanFeature[];
  includedFeatures!: IncludedFeatures | null;
  isActive!: boolean;
  supportLevel!: string | null;
  customizable!: boolean;
  contactEmail!: string | null;
  contactPhone!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class PricingPlanResponseDto {
  id!: string;
  planType!: PlanType;
  name!: string;
  description!: string | null;
  price!: number;
  displayPrice!: string | null;
  features!: PlanFeature[];
  includedFeatures!: IncludedFeatures | null;
  isActive!: boolean;
  supportLevel!: string | null;
  customizable!: boolean;
  contactEmail!: string | null;
  contactPhone!: string | null;
}

// Subscription DTOs
export class CreateSubscriptionDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  billingCycleMonths?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  customizations?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  billingCycleMonths?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  customizations?: string;
}

export class SubscriptionDto {
  id!: string;
  organizationId!: string;
  planId!: string;
  plan!: PricingPlanResponseDto;
  status!: SubscriptionStatus;
  startDate!: Date;
  endDate!: Date | null;
  renewalDate!: Date | null;
  autoRenew!: boolean;
  billingCycleMonths!: number | null;
  totalPaid!: number | null;
  paymentMethod!: string | null;
  customizations!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
