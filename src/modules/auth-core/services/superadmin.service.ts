import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { UserActivity } from '../entities/user-actvities.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../../pricing/entities/subscription.entity';
import { PricingPlan } from '../../pricing/entities/pricing-plan.entity';
import { OrganizationService } from './organization.service';
import { PricingService } from '../../pricing/pricing.service';

@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(PricingPlan)
    private readonly pricingPlanRepo: Repository<PricingPlan>,
    @InjectRepository(UserActivity)
    private readonly userActivityRepo: Repository<UserActivity>,
    private readonly orgService: OrganizationService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Get overall platform metrics
   */
  async getStats() {
    const [totalOrgs, activeOrgs, totalUsers] = await Promise.all([
      this.orgRepo.count(),
      this.orgRepo.count({ where: { isActive: true } }),
      this.userRepo.count(),
    ]);

    // Active trials and paid active subscriptions
    const [activeSubscriptions, trialSubscriptions] = await Promise.all([
      this.subscriptionRepo.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.subscriptionRepo.count({
        where: { status: SubscriptionStatus.TRIAL },
      }),
    ]);

    // Calculate MRR: sum of pricing plan prices for active paid subscriptions
    const activeSubDetails = await this.subscriptionRepo.find({
      where: { status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
    const estimatedMRR = activeSubDetails.reduce((sum, sub) => {
      const price = sub.plan?.price || 0;
      const months = sub.billingCycleMonths || 1;
      return sum + price / months;
    }, 0);

    // Organization plan distribution
    const planBreakdown = { BASIC: 0, PRO: 0, ENTERPRISE: 0 };
    const allSubs = await this.subscriptionRepo.find({
      where: { status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
    allSubs.forEach((sub) => {
      if (sub.plan?.planType) {
        planBreakdown[sub.plan.planType] =
          (planBreakdown[sub.plan.planType] || 0) + 1;
      }
    });

    // Recent 5 signups
    const recentSignups = await this.orgRepo.find({
      order: { createdOn: 'DESC' },
      take: 5,
    });

    return {
      totalOrganizations: totalOrgs,
      activeOrganizations: activeOrgs,
      totalUsers,
      activeSubscriptions,
      trialSubscriptions,
      estimatedMRR,
      planBreakdown,
      recentSignups: recentSignups.map((org) => ({
        id: org.id,
        name: org.organizationName,
        email: org.email,
        createdOn: org.createdOn,
        isActive: org.isActive,
      })),
    };
  }

  /**
   * Get all organizations with subscription plans and user counts
   */
  async getOrganizations() {
    const orgs = await this.orgRepo.find({
      relations: ['users'],
    });

    // Get active subscriptions for all orgs
    const subs = await this.subscriptionRepo.find({
      relations: ['plan'],
    });

    return orgs.map((org) => {
      const activeSub = subs.find(
        (sub) =>
          sub.organizationId === org.id &&
          (sub.status === SubscriptionStatus.ACTIVE ||
            sub.status === SubscriptionStatus.TRIAL),
      );

      return {
        id: org.id,
        name: org.organizationName,
        email: org.email,
        phone: org.phone,
        address: org.address,
        isActive: org.isActive,
        createdOn: org.createdOn,
        userCount: org.users?.length || 0,
        subscription: activeSub
          ? {
              planName: activeSub.plan?.name,
              planType: activeSub.plan?.planType,
              status: activeSub.status,
              endDate: activeSub.endDate,
            }
          : null,
      };
    });
  }

  /**
   * Get all subscriptions along with organization details
   */
  async getSubscriptions() {
    const subs = await this.subscriptionRepo.find({
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    const orgs = await this.orgRepo.find({
      select: ['id', 'organizationName'],
    });

    return subs.map((sub) => {
      const org = orgs.find((o) => o.id === sub.organizationId);
      return {
        ...sub,
        organizationName: org ? org.organizationName : 'Unknown Organization',
      };
    });
  }

  /**
   * Block an organization — its users can no longer log in, and any
   * already-issued tokens for that org are rejected on the next request.
   */
  async blockOrganization(id: string, updatedBy: string) {
    return this.orgService.blockOrganization(id, updatedBy);
  }

  /**
   * Unblock a previously blocked organization.
   */
  async unblockOrganization(id: string, updatedBy: string) {
    return this.orgService.unblockOrganization(id, updatedBy);
  }

  /**
   * Get system-wide user logs
   */
  async getSystemLogs(limit = 100, offset = 0) {
    const [rawData, total] = await this.userActivityRepo
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.user', 'user')
      .leftJoinAndSelect('user.organization', 'org')
      .orderBy('activity.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const data = rawData.map((activity) => ({
      id: activity.id,
      userName: activity.user?.userName,
      name: `${activity.user?.firstName ?? ''} ${activity.user?.lastName ?? ''}`.trim(),
      organizationName:
        activity.user?.organization?.organizationName || 'System',
      activityType: activity.activityType,
      description: activity.activityDescription,
      location:
        activity.metadata?.location || activity.metadata?.ip || 'Unknown',
      device:
        activity.metadata?.deviceType ||
        activity.metadata?.userAgent ||
        'Unknown',
      loggedAt: activity.createdAt,
      isSuccess: activity.isSuccess,
    }));

    return { data, total };
  }
}
