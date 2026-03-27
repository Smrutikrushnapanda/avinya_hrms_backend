import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import {
  CreatePricingPlanDto,
  UpdatePricingPlanDto,
  PricingPlanResponseDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  SubscriptionDto,
} from './dto/pricing.dto';
import { PlanType } from './entities/pricing-plan.entity';
import { SubscriptionStatus } from './entities/subscription.entity';

@ApiTags('Pricing')
@Controller('api/pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  // ==================== Pricing Plan Endpoints ====================

  @ApiOperation({ summary: 'Create a new pricing plan' })
  @ApiResponse({
    status: 201,
    description: 'Pricing plan created successfully',
    type: PricingPlanResponseDto,
  })
  @Post('plans')
  @HttpCode(HttpStatus.CREATED)
  async createPlan(
    @Body() createPricingPlanDto: CreatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
    const plan = await this.pricingService.createPlan(createPricingPlanDto);
    return this.pricingService.getPlanById(plan.id);
  }

  @ApiOperation({ summary: 'Get all pricing plans' })
  @ApiResponse({
    status: 200,
    description: 'List of all pricing plans',
    type: [PricingPlanResponseDto],
  })
  @Get('plans')
  async getAllPlans(
    @Query('includeInactive') includeInactive: boolean = false,
  ): Promise<PricingPlanResponseDto[]> {
    return this.pricingService.getAllPlans(includeInactive);
  }

  @ApiOperation({ summary: 'Get a pricing plan by ID' })
  @ApiResponse({
    status: 200,
    description: 'Pricing plan details',
    type: PricingPlanResponseDto,
  })
  @Get('plans/:id')
  async getPlanById(@Param('id') id: string): Promise<PricingPlanResponseDto> {
    return this.pricingService.getPlanById(id);
  }

  @ApiOperation({ summary: 'Get a pricing plan by type' })
  @ApiResponse({
    status: 200,
    description: 'Pricing plan details',
    type: PricingPlanResponseDto,
  })
  @Get('plans/type/:planType')
  async getPlanByType(
    @Param('planType') planType: PlanType,
  ): Promise<PricingPlanResponseDto> {
    return this.pricingService.getPlanByType(planType);
  }

  @ApiOperation({ summary: 'Update a pricing plan' })
  @ApiResponse({
    status: 200,
    description: 'Pricing plan updated successfully',
    type: PricingPlanResponseDto,
  })
  @Put('plans/:id')
  async updatePlan(
    @Param('id') id: string,
    @Body() updatePricingPlanDto: UpdatePricingPlanDto,
  ): Promise<PricingPlanResponseDto> {
    await this.pricingService.updatePlan(id, updatePricingPlanDto);
    return this.pricingService.getPlanById(id);
  }

  @ApiOperation({ summary: 'Delete a pricing plan' })
  @ApiResponse({
    status: 204,
    description: 'Pricing plan deleted successfully',
  })
  @Delete('plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePlan(@Param('id') id: string): Promise<void> {
    return this.pricingService.deletePlan(id);
  }

  // ==================== Subscription Endpoints ====================

  @ApiOperation({ summary: 'Create a new subscription' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created successfully',
    type: SubscriptionDto,
  })
  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  async createSubscription(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    const subscription = await this.pricingService.createSubscription(
      createSubscriptionDto,
    );
    return this.pricingService.getSubscriptionById(subscription.id);
  }

  @ApiOperation({ summary: 'Get subscription by organization ID' })
  @ApiResponse({
    status: 200,
    description: 'Organization subscription details',
    type: SubscriptionDto,
  })
  @Get('subscriptions/organization/:organizationId')
  async getSubscriptionByOrganizationId(
    @Param('organizationId') organizationId: string,
  ): Promise<SubscriptionDto | null> {
    return this.pricingService.getSubscriptionByOrganizationId(organizationId);
  }

  @ApiOperation({ summary: 'Get subscription by ID' })
  @ApiResponse({
    status: 200,
    description: 'Subscription details',
    type: SubscriptionDto,
  })
  @Get('subscriptions/:id')
  async getSubscriptionById(@Param('id') id: string): Promise<SubscriptionDto> {
    return this.pricingService.getSubscriptionById(id);
  }

  @ApiOperation({ summary: 'Get all subscriptions' })
  @ApiResponse({
    status: 200,
    description: 'List of all subscriptions',
    type: [SubscriptionDto],
  })
  @Get('subscriptions')
  async getAllSubscriptions(
    @Query('status') status?: SubscriptionStatus,
  ): Promise<SubscriptionDto[]> {
    return this.pricingService.getAllSubscriptions(status);
  }

  @ApiOperation({ summary: 'Update a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated successfully',
    type: SubscriptionDto,
  })
  @Put('subscriptions/:id')
  async updateSubscription(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    await this.pricingService.updateSubscription(id, updateSubscriptionDto);
    return this.pricingService.getSubscriptionById(id);
  }

  @ApiOperation({ summary: 'Renew a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription renewed successfully',
    type: SubscriptionDto,
  })
  @Post('subscriptions/:id/renew')
  async renewSubscription(@Param('id') id: string): Promise<SubscriptionDto> {
    await this.pricingService.renewSubscription(id);
    return this.pricingService.getSubscriptionById(id);
  }

  @ApiOperation({ summary: 'Cancel a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription cancelled successfully',
    type: SubscriptionDto,
  })
  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Param('id') id: string): Promise<SubscriptionDto> {
    await this.pricingService.cancelSubscription(id);
    return this.pricingService.getSubscriptionById(id);
  }

  // ==================== Utility Endpoints ====================

  @ApiOperation({ summary: 'Check if organization has a feature' })
  @ApiResponse({
    status: 200,
    description: 'Feature availability for organization',
  })
  @Get('organizations/:organizationId/has-feature/:featureName')
  async hasFeature(
    @Param('organizationId') organizationId: string,
    @Param('featureName') featureName: string,
  ): Promise<{ hasFeature: boolean }> {
    const hasFeature = await this.pricingService.hasFeature(
      organizationId,
      featureName,
    );
    return { hasFeature };
  }

  @ApiOperation({ summary: 'Get organization active plan' })
  @ApiResponse({
    status: 200,
    description: 'Organization active pricing plan',
    type: PricingPlanResponseDto,
  })
  @Get('organizations/:organizationId/plan')
  async getOrganizationPlan(
    @Param('organizationId') organizationId: string,
  ): Promise<PricingPlanResponseDto | null> {
    return this.pricingService.getOrganizationPlan(organizationId);
  }
}
