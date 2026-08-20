import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
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
import { RenewalEmailLog } from '../entities/renewal-email-log.entity';
import { MailService } from '../../mail/mail.service';

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
    @InjectRepository(RenewalEmailLog)
    private readonly renewalEmailLogRepo: Repository<RenewalEmailLog>,
    private readonly orgService: OrganizationService,
    private readonly pricingService: PricingService,
    private readonly mailService: MailService,
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

  /**
   * Get detailed revenue breakdown per organization
   */
  async getRevenueBreakdown() {
    const orgs = await this.orgRepo.find({ relations: ['users'] });
    const allSubs = await this.subscriptionRepo.find({
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    let totalRevenue = 0;
    let monthlyRecurringRevenue = 0;
    let annualRecurringRevenue = 0;

    const orgRevenue = orgs.map((org) => {
      const orgSubs = allSubs.filter((sub) => sub.organizationId === org.id);
      const activeSub = orgSubs.find(
        (sub) => sub.status === SubscriptionStatus.ACTIVE,
      );
      const trialSub = orgSubs.find(
        (sub) => sub.status === SubscriptionStatus.TRIAL,
      );

      const price = activeSub?.plan?.price || 0;
      const billingMonths = activeSub?.billingCycleMonths || 1;
      const monthlyRevenue = price / billingMonths;
      const totalPaid = activeSub?.totalPaid || 0;

      totalRevenue += totalPaid;
      monthlyRecurringRevenue += monthlyRevenue;

      return {
        organizationId: org.id,
        organizationName: org.organizationName,
        email: org.email,
        isActive: org.isActive,
        planName: activeSub?.plan?.name || trialSub?.plan?.name || 'No Plan',
        planType: activeSub?.plan?.planType || trialSub?.plan?.planType || null,
        subscriptionStatus: activeSub?.status || trialSub?.status || 'NONE',
        monthlyRevenue,
        totalPaid,
        startDate: activeSub?.startDate || trialSub?.startDate || null,
        endDate: activeSub?.endDate || trialSub?.endDate || null,
        renewalDate: activeSub?.renewalDate || null,
        autoRenew: activeSub?.autoRenew || false,
        userCount: org.users?.length || 0,
      };
    });

    annualRecurringRevenue = monthlyRecurringRevenue * 12;

    return {
      totalRevenue,
      monthlyRecurringRevenue,
      annualRecurringRevenue,
      orgRevenue: orgRevenue.sort(
        (a, b) => b.monthlyRevenue - a.monthlyRevenue,
      ),
    };
  }

  /**
   * Get subscriptions expiring within a given number of days
   */
  async getExpiringSoon(days = 30) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const subs = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.plan', 'plan')
      .where('sub.endDate <= :futureDate', { futureDate })
      .andWhere('sub.endDate >= :now', { now })
      .andWhere('sub.status IN (:...statuses)', {
        statuses: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL],
      })
      .orderBy('sub.endDate', 'ASC')
      .getMany();

    const orgs = await this.orgRepo.find({
      select: ['id', 'organizationName', 'email', 'hrMail'],
    });

    return subs.map((sub) => {
      const org = orgs.find((o) => o.id === sub.organizationId);
      const endDateStr = sub.endDate
        ? new Date(sub.endDate).getTime()
        : now.getTime();
      const daysUntilExpiry = Math.ceil(
        (endDateStr - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      return {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        organizationName: org?.organizationName || 'Unknown',
        contactEmail: org?.email || org?.hrMail || null,
        planName: sub.plan?.name || 'Unknown',
        planType: sub.plan?.planType || 'UNKNOWN',
        planPrice: sub.plan?.price || 0,
        status: sub.status,
        endDate: sub.endDate,
        renewalDate: sub.renewalDate,
        daysUntilExpiry,
        urgency:
          daysUntilExpiry <= 7
            ? 'CRITICAL'
            : daysUntilExpiry <= 14
              ? 'HIGH'
              : 'MEDIUM',
      };
    });
  }

  /**
   * Send renewal reminder email to an organization
   */
  async sendRenewalEmail(data: {
    organizationId: string;
    customMessage?: string;
    sentBy: string;
  }) {
    const org = await this.orgRepo.findOne({
      where: { id: data.organizationId },
    });
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    const activeSub = await this.subscriptionRepo.findOne({
      where: {
        organizationId: data.organizationId,
        status: SubscriptionStatus.ACTIVE,
      },
      relations: ['plan'],
    });

    if (!activeSub) {
      throw new BadRequestException(
        'No active subscription found for this organization',
      );
    }

    const recipientEmail = org.hrMail || org.email;
    if (!recipientEmail) {
      throw new BadRequestException(
        'No contact email configured for this organization',
      );
    }

    const endDate = activeSub.endDate
      ? new Date(activeSub.endDate)
      : new Date();
    const daysUntilExpiry = Math.ceil(
      (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const subject = `[Renewal Reminder] Your ${activeSub.plan?.name || 'HRMS'} subscription expires in ${daysUntilExpiry} days`;
    const customNote = data.customMessage
      ? `\n\nAdditional message from our team:\n${data.customMessage}`
      : '';

    const content = `
      <h2 style="margin:0 0 8px;font-size:24px;color:#111827;">Subscription Renewal Reminder</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
        Hi there, this is a friendly reminder that your <strong>${activeSub.plan?.name || 'HRMS'}</strong> subscription for <strong>${org.organizationName}</strong> is approaching its renewal date.
      </p>

      <div style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;width:160px;vertical-align:top;">Plan</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${activeSub.plan?.name || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Expiry Date</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${endDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Days Remaining</td>
            <td style="padding:8px 0;color:${daysUntilExpiry <= 7 ? '#dc2626' : '#f59e0b'};font-size:14px;font-weight:700;">${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Monthly Price</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">₹${(activeSub.plan?.price || 0).toLocaleString()}/month</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Auto-Renew</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${activeSub.autoRenew ? 'Enabled' : 'Disabled'}</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        To ensure uninterrupted access to your HRMS platform, please renew your subscription before the expiry date. If you have any questions or need assistance with renewal, please contact our support team.
      </p>

      ${customNote}

      <div style="text-align:center;margin:24px 0;">
        <a href="https://avinyahrms.duckdns.org/admin/settings" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Renew Subscription
        </a>
      </div>
    `;

    await this.mailService.sendMail({
      from: '"Avinya HRMS" <smrutikrushnapanda@gmail.com>',
      to: recipientEmail,
      subject,
      html: this.mailService.buildEmailWrapperForSuperadmin(
        org.organizationName,
        org.logoUrl ?? null,
        content,
      ),
    });

    const logEntity = new RenewalEmailLog();
    logEntity.organizationId = org.id;
    logEntity.organizationName = org.organizationName;
    logEntity.recipientEmail = recipientEmail;
    logEntity.subject = subject;
    logEntity.emailType = 'RENEWAL_REMINDER';
    logEntity.sentBy = data.sentBy;
    logEntity.subscriptionEndDate = activeSub.endDate ?? new Date();
    logEntity.planName = activeSub.plan?.name ?? null;
    logEntity.planPrice = activeSub.plan?.price ?? null;
    logEntity.status = 'SENT';
    logEntity.notes = data.customMessage ?? null;
    const log = await this.renewalEmailLogRepo.save(logEntity);

    return {
      message: `Renewal reminder sent to ${org.organizationName} at ${recipientEmail}`,
      logId: log.id,
    };
  }

  /**
   * Send bulk renewal emails to all orgs expiring within given days
   */
  async sendBulkRenewalEmails(data: {
    daysThreshold?: number;
    customMessage?: string;
    sentBy: string;
  }) {
    const expiringOrgs = await this.getExpiringSoon(data.daysThreshold || 30);
    const results: Array<{
      organizationId: string;
      success: boolean;
      message?: string;
      error?: string;
    }> = [];

    for (const org of expiringOrgs) {
      try {
        const result = await this.sendRenewalEmail({
          organizationId: org.organizationId,
          customMessage: data.customMessage,
          sentBy: data.sentBy,
        });
        results.push({
          organizationId: org.organizationId,
          success: true,
          message: result.message,
        });
      } catch (error) {
        results.push({
          organizationId: org.organizationId,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalTargeted: expiringOrgs.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Get renewal email history
   */
  async getRenewalEmailHistory(limit = 50, offset = 0) {
    const [logs, total] = await this.renewalEmailLogRepo.findAndCount({
      order: { sentAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { data: logs, total };
  }

  /**
   * Get enhanced platform overview with more metrics
   */
  async getEnhancedStats() {
    const baseStats = await this.getStats();

    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const [expiringCount, expiredCount, blockedOrgs] = await Promise.all([
      this.subscriptionRepo.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          endDate: LessThanOrEqual(thirtyDaysFromNow),
        },
      }),
      this.subscriptionRepo.count({
        where: {
          status: SubscriptionStatus.EXPIRED,
        },
      }),
      this.orgRepo.count({ where: { isActive: false } }),
    ]);

    const revenue = await this.getRevenueBreakdown();

    return {
      ...baseStats,
      expiringSubscriptions: expiringCount,
      expiredSubscriptions: expiredCount,
      blockedOrganizations: blockedOrgs,
      totalRevenue: revenue.totalRevenue,
      monthlyRecurringRevenue: revenue.monthlyRecurringRevenue,
      annualRecurringRevenue: revenue.annualRecurringRevenue,
      renewalEmailsSent: await this.renewalEmailLogRepo.count(),
    };
  }

  /**
   * Get org detailed view with subscription history
   */
  async getOrganizationDetails(orgId: string) {
    const org = await this.orgRepo.findOne({
      where: { id: orgId },
      relations: ['users'],
    });

    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    const subs = await this.subscriptionRepo.find({
      where: { organizationId: orgId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    const renewalLogs = await this.renewalEmailLogRepo.find({
      where: { organizationId: orgId },
      order: { sentAt: 'DESC' },
      take: 20,
    });

    const activeSub = subs.find((s) => s.status === SubscriptionStatus.ACTIVE);

    return {
      id: org.id,
      name: org.organizationName,
      email: org.email,
      hrMail: org.hrMail,
      phone: org.phone,
      address: org.address,
      logoUrl: org.logoUrl,
      isActive: org.isActive,
      createdOn: org.createdOn,
      userCount: org.users?.length || 0,
      currentSubscription: activeSub
        ? {
            planName: activeSub.plan?.name,
            planType: activeSub.plan?.planType,
            price: activeSub.plan?.price,
            status: activeSub.status,
            startDate: activeSub.startDate,
            endDate: activeSub.endDate,
            renewalDate: activeSub.renewalDate,
            autoRenew: activeSub.autoRenew,
            totalPaid: activeSub.totalPaid,
            billingCycleMonths: activeSub.billingCycleMonths,
          }
        : null,
      subscriptionHistory: subs.map((s) => ({
        id: s.id,
        planName: s.plan?.name,
        planType: s.plan?.planType,
        price: s.plan?.price,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        totalPaid: s.totalPaid,
        createdAt: s.createdAt,
      })),
      renewalEmailHistory: renewalLogs,
    };
  }
}
