import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PricingPlan,
  PlanType,
  PlanFeature,
} from './entities/pricing-plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from './entities/subscription.entity';
import {
  CreatePricingPlanDto,
  UpdatePricingPlanDto,
  PricingPlanResponseDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionDto,
} from './dto/pricing.dto';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly currentSubscriptionStatuses = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIAL,
  ];

  constructor(
    @InjectRepository(PricingPlan)
    private readonly pricingPlanRepository: Repository<PricingPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  // ==================== Pricing Plan Methods ====================

  /**
   * Create a new pricing plan
   */
  async createPlan(
    createPricingPlanDto: CreatePricingPlanDto,
  ): Promise<PricingPlan> {
    const existingPlan = await this.pricingPlanRepository.findOne({
      where: { planType: createPricingPlanDto.planType },
    });

    if (existingPlan) {
      throw new BadRequestException(
        `Pricing plan with type ${createPricingPlanDto.planType} already exists`,
      );
    }

    const plan = this.pricingPlanRepository.create({
      ...createPricingPlanDto,
      displayPrice:
        createPricingPlanDto.displayPrice ||
        `₹${createPricingPlanDto.price}/month`,
    });

    return await this.pricingPlanRepository.save(plan);
  }

  /**
   * Get all pricing plans
   */
  async getAllPlans(
    includeInactive = false,
  ): Promise<PricingPlanResponseDto[]> {
    const query = this.pricingPlanRepository.createQueryBuilder('plan');

    if (!includeInactive) {
      query.where('plan.isActive = :isActive', { isActive: true });
    }

    const plans = await query.orderBy('plan.price', 'ASC').getMany();
    return plans.map((plan) => this.mapPlanToResponse(plan));
  }

  /**
   * Get a pricing plan by ID
   */
  async getPlanById(id: string): Promise<PricingPlanResponseDto> {
    const plan = await this.pricingPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Pricing plan with ID ${id} not found`);
    }

    return this.mapPlanToResponse(plan);
  }

  /**
   * Get a pricing plan by type
   */
  async getPlanByType(planType: PlanType): Promise<PricingPlanResponseDto> {
    const plan = await this.pricingPlanRepository.findOne({
      where: { planType },
    });

    if (!plan) {
      throw new NotFoundException(`Pricing plan of type ${planType} not found`);
    }

    return this.mapPlanToResponse(plan);
  }

  /**
   * Update a pricing plan
   */
  async updatePlan(
    id: string,
    updatePricingPlanDto: UpdatePricingPlanDto,
  ): Promise<PricingPlan> {
    const plan = await this.pricingPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Pricing plan with ID ${id} not found`);
    }

    Object.assign(plan, updatePricingPlanDto);

    if (
      updatePricingPlanDto.price !== undefined &&
      !updatePricingPlanDto.displayPrice
    ) {
      plan.displayPrice = `₹${updatePricingPlanDto.price}/month`;
    }

    return await this.pricingPlanRepository.save(plan);
  }

  /**
   * Delete a pricing plan
   */
  async deletePlan(id: string): Promise<void> {
    const plan = await this.pricingPlanRepository.findOne({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Pricing plan with ID ${id} not found`);
    }

    const subscriptionCount = await this.subscriptionRepository.count({
      where: { planId: id },
    });

    if (subscriptionCount > 0) {
      throw new BadRequestException(
        'Cannot delete a plan that already has subscriptions',
      );
    }

    await this.pricingPlanRepository.remove(plan);
  }

  // ==================== Subscription Methods ====================

  /**
   * Create a new subscription
   */
  async createSubscription(
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<Subscription> {
    const plan = await this.pricingPlanRepository.findOne({
      where: { id: createSubscriptionDto.planId },
    });

    if (!plan) {
      throw new NotFoundException(
        `Pricing plan with ID ${createSubscriptionDto.planId} not found`,
      );
    }

    const startDate = this.normalizeDate(createSubscriptionDto.startDate);
    const endDate = createSubscriptionDto.endDate
      ? this.normalizeDate(createSubscriptionDto.endDate)
      : this.calculateEndDate(
          startDate,
          createSubscriptionDto.billingCycleMonths ?? 1,
        );

    // Check if organization already has a current subscription
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: {
        organizationId: createSubscriptionDto.organizationId,
        status: In(this.currentSubscriptionStatuses),
      },
    });

    if (existingSubscription) {
      throw new BadRequestException(
        'Organization already has an active or trial subscription',
      );
    }

    const subscription = this.subscriptionRepository.create({
      ...createSubscriptionDto,
      startDate,
      endDate,
      renewalDate: endDate,
      billingCycleMonths: createSubscriptionDto.billingCycleMonths ?? 1,
    });

    return await this.subscriptionRepository.save(subscription);
  }

  /**
   * Get subscription by organization ID
   */
  async getSubscriptionByOrganizationId(
    organizationId: string,
  ): Promise<SubscriptionDto | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        organizationId,
        status: In(this.currentSubscriptionStatuses),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      return null;
    }

    return this.mapSubscriptionToResponse(subscription);
  }

  /**
   * Get subscription by ID
   */
  async getSubscriptionById(id: string): Promise<SubscriptionDto> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: ['plan'],
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return this.mapSubscriptionToResponse(subscription);
  }

  /**
   * Get all subscriptions
   */
  async getAllSubscriptions(
    status?: SubscriptionStatus,
  ): Promise<SubscriptionDto[]> {
    const query = this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.plan', 'plan');

    if (status) {
      query.where('subscription.status = :status', { status });
    }

    const subscriptions = await query
      .orderBy('subscription.createdAt', 'DESC')
      .getMany();
    return subscriptions.map((sub) => this.mapSubscriptionToResponse(sub));
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    id: string,
    updateSubscriptionDto: UpdateSubscriptionDto,
  ): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    Object.assign(subscription, updateSubscriptionDto);

    if (updateSubscriptionDto.endDate) {
      subscription.endDate = this.normalizeDate(updateSubscriptionDto.endDate);
      subscription.renewalDate = subscription.endDate;
    }

    return await this.subscriptionRepository.save(subscription);
  }

  /**
   * Renew a subscription
   */
  async renewSubscription(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    const billingCycles = subscription.billingCycleMonths || 1;
    const newEndDate = new Date();
    newEndDate.setMonth(newEndDate.getMonth() + billingCycles);

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.startDate = new Date();
    subscription.endDate = newEndDate;
    subscription.renewalDate = newEndDate;

    return await this.subscriptionRepository.save(subscription);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    subscription.status = SubscriptionStatus.INACTIVE;
    subscription.autoRenew = false;

    return await this.subscriptionRepository.save(subscription);
  }

  /**
   * Check if organization has plan feature
   */
  async hasFeature(
    organizationId: string,
    featureName: string,
  ): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        organizationId,
        status: In(this.currentSubscriptionStatuses),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.plan) {
      return false;
    }

    const feature = subscription.plan.features?.find(
      (f: PlanFeature) => f.name === featureName,
    );
    return feature?.available || false;
  }

  /**
   * Get organization's active plan
   */
  async getOrganizationPlan(
    organizationId: string,
  ): Promise<PricingPlanResponseDto | null> {
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        organizationId,
        status: In(this.currentSubscriptionStatuses),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.plan) {
      return null;
    }

    return this.mapPlanToResponse(subscription.plan);
  }

  // ==================== Helper Methods ====================

  private normalizeDate(dateValue: string): Date {
    const parsedDate = new Date(dateValue);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`Invalid date provided: ${dateValue}`);
    }

    return parsedDate;
  }

  private calculateEndDate(startDate: Date, billingCycleMonths: number): Date {
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + billingCycleMonths);
    return endDate;
  }

  private mapPlanToResponse(plan: PricingPlan): PricingPlanResponseDto {
    return {
      id: plan.id,
      planType: plan.planType,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      displayPrice: plan.displayPrice,
      features: plan.features || [],
      includedFeatures: plan.includedFeatures || {
        mobile: [],
        web: [],
        admin: [],
      },
      isActive: plan.isActive,
      supportLevel: plan.supportLevel,
      customizable: plan.customizable,
      contactEmail: plan.contactEmail,
      contactPhone: plan.contactPhone,
    };
  }

  private mapSubscriptionToResponse(
    subscription: Subscription,
  ): SubscriptionDto {
    return {
      id: subscription.id,
      organizationId: subscription.organizationId,
      planId: subscription.planId,
      plan: this.mapPlanToResponse(subscription.plan),
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      renewalDate: subscription.renewalDate,
      autoRenew: subscription.autoRenew,
      billingCycleMonths: subscription.billingCycleMonths,
      totalPaid: subscription.totalPaid,
      paymentMethod: subscription.paymentMethod,
      customizations: subscription.customizations,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
