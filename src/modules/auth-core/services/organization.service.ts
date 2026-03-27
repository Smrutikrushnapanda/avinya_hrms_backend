import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { OrganizationSettings } from '../entities/organization-settings.entity';
import { PricingType } from '../entities/pricing-type.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { CreateOrganizationDto, UpdateOrganizationDto, ChangeCredentialsDto, StartTrialDto } from '../dto/organization.dto';
import { RoleType } from '../enums/role-type.enum';
import { LeaveService } from '../../leave/leave.service';
import { WfhService } from '../../wfh/wfh.service';
import { MailService } from '../../mail/mail.service';
import { PricingService } from '../../pricing/pricing.service';
import { PlanType } from '../../pricing/entities/pricing-plan.entity';
import { SubscriptionStatus } from '../../pricing/entities/subscription.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OrganizationService {
  private readonly defaultAdminUserName = 'avinya_hrms';
  private readonly defaultAdminPassword = 'password';

  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationSettings)
    private readonly orgSettingsRepo: Repository<OrganizationSettings>,
    @InjectRepository(PricingType)
    private readonly pricingTypeRepo: Repository<PricingType>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @Inject(forwardRef(() => LeaveService))
    private readonly leaveService: LeaveService,
    @Inject(forwardRef(() => WfhService))
    private readonly wfhService: WfhService,
    private readonly mailService: MailService,
    private readonly pricingService: PricingService,
  ) {}

  private normalizeNullableText(value?: string | null): string | null {
    if (value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private async getAvailableAdminUserName(): Promise<string> {
    const existingBase = await this.userRepo.findOne({
      where: { userName: this.defaultAdminUserName },
      select: ['id'],
    });

    if (!existingBase) {
      return this.defaultAdminUserName;
    }

    let suffix = 2;
    while (suffix <= 9999) {
      const candidate = `${this.defaultAdminUserName}_${suffix}`;
      const existing = await this.userRepo.findOne({
        where: { userName: candidate },
        select: ['id'],
      });
      if (!existing) {
        return candidate;
      }
      suffix += 1;
    }

    throw new ConflictException('Unable to allocate default admin username right now.');
  }

  private mapPricingTypeToPlanType(pricingTypeId: number): PlanType {
    switch (pricingTypeId) {
      case 1:
        return PlanType.BASIC;
      case 2:
        return PlanType.PRO;
      case 3:
        return PlanType.ENTERPRISE;
      default:
        throw new BadRequestException('Invalid pricing type selected.');
    }
  }

  async create(data: CreateOrganizationDto, createdBy: string) {
    const org = await this.orgRepo.save(
      this.orgRepo.create({
        organizationName: data.organizationName,
        email: data.email,
        hrMail: data.hrMail,
        phone: data.phone,
        address: data.address,
        logoUrl: data.logoUrl,
        siteUrl: data.siteUrl,
        landingLink: data.landingLink,
        enableGpsValidation: data.enableGpsValidation,
        enableWifiValidation: data.enableWifiValidation,
        wfhApprovalMode: data.wfhApprovalMode,
        isActive: data.isActive,
        createdBy,
        updatedBy: createdBy,
      }),
    );

    const settings = new OrganizationSettings();
    settings.organizationId = org.id;
    settings.homeHeaderBackgroundColor = this.normalizeNullableText(data.homeHeaderBackgroundColor);
    settings.homeHeaderMediaUrl = this.normalizeNullableText(data.homeHeaderMediaUrl);
    settings.homeHeaderMediaStartDate = this.normalizeNullableText(data.homeHeaderMediaStartDate);
    settings.homeHeaderMediaEndDate = this.normalizeNullableText(data.homeHeaderMediaEndDate);
    settings.resignationPolicy = this.normalizeNullableText(data.resignationPolicy);
    settings.resignationNoticePeriodDays = Number(data.resignationNoticePeriodDays ?? 30) || 30;
    settings.allowEarlyRelievingByAdmin = Boolean(data.allowEarlyRelievingByAdmin);
    settings.sessionStartMonth = Number(data.sessionStartMonth ?? 4) || 4;
    settings.leaveCarryForwardEnabled = Boolean(data.leaveCarryForwardEnabled);
    settings.wfhCarryForwardEnabled = Boolean(data.wfhCarryForwardEnabled);
    await this.orgSettingsRepo.save(settings);

    // Ensure ADMIN role exists for this org
    let adminRole = await this.roleRepo.findOne({ where: { roleName: 'ADMIN' } });
    if (!adminRole) {
      adminRole = await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'ADMIN',
          type: RoleType.DEFAULT,
          description: 'System administrator',
          organizationId: org.id,
        }),
      );
    }

    // Ensure HR role exists
    let hrRole = await this.roleRepo.findOne({ where: { roleName: 'HR' } });
    if (!hrRole) {
      await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'HR',
          type: RoleType.DEFAULT,
          description: 'Human resources role',
          organizationId: org.id,
        }),
      );
    }

    // Ensure EMPLOYEE role exists
    let employeeRole = await this.roleRepo.findOne({ where: { roleName: 'EMPLOYEE' } });
    if (!employeeRole) {
      await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'EMPLOYEE',
          type: RoleType.DEFAULT,
          description: 'Default employee role',
          organizationId: org.id,
        }),
      );
    }

    // Create default admin user for this org
    const adminUserName = await this.getAvailableAdminUserName();
    const hashedPassword = await bcrypt.hash(this.defaultAdminPassword, 12);
    const adminUser = await this.userRepo.save(
      this.userRepo.create({
        userName: adminUserName,
        email: data.email || `admin@${org.id}.hrms`,
        password: hashedPassword,
        firstName: 'Admin',
        lastName: '',
        organization: org,
        isActive: true,
        mustChangePassword: true,
      }),
    );

    await this.userRoleRepo.save(
      this.userRoleRepo.create({ user: adminUser, role: adminRole, isActive: true }),
    );

    return {
      ...org,
      adminUserName,
      adminDefaultPassword: this.defaultAdminPassword,
    };
  }

  async startTrial(data: StartTrialDto) {
    const companyName = data.company.trim();
    const contactName = data.name.trim();
    const email = this.normalizeEmail(data.email);
    const phone = data.phone?.trim() || undefined;
    const source = data.source?.trim() || 'pricing-start-trial';
    const pricingTypeId = data.pricingTypeId ?? 2;

    const pricingType = await this.pricingTypeRepo.findOne({
      where: { typeId: pricingTypeId },
    });

    if (!pricingType) {
      throw new BadRequestException('Invalid pricing type selected.');
    }

    if (pricingType.isCustomPricing || pricingType.typeId === 3) {
      throw new BadRequestException(
        'Enterprise requests should be handled by the sales team.',
      );
    }

    const planType = this.mapPricingTypeToPlanType(pricingType.typeId);
    const pricingPlan = await this.pricingService.getPlanByType(planType);

    const existingOrganization = await this.orgRepo
      .createQueryBuilder('organization')
      .select('organization.id')
      .where('LOWER(organization.organizationName) = LOWER(:companyName)', { companyName })
      .getRawOne();

    if (existingOrganization) {
      throw new ConflictException(
        'An organization with this company name already exists. Please sign in or contact support.',
      );
    }

    const existingUser = await this.userRepo
      .createQueryBuilder('user')
      .select('user.id')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getRawOne();

    if (existingUser) {
      throw new ConflictException(
        'This email is already registered. Please sign in with your existing account.',
      );
    }

    const organization = await this.create(
      {
        organizationName: companyName,
        email,
        hrMail: email,
        phone,
        isActive: true,
        createdBy: `trial:${source}`,
      },
      'trial-system',
    );

    await this.pricingService.createSubscription({
      organizationId: organization.id,
      planId: pricingPlan.id,
      status: SubscriptionStatus.TRIAL,
      startDate: new Date().toISOString(),
      billingCycleMonths: 1,
      paymentMethod: 'TRIAL',
      customizations: `${pricingType.typeName} trial signup (${source})`,
    });

    await this.mailService.sendEmployeeCredentials({
      organizationId: organization.id,
      employeeEmail: email,
      employeeName: contactName,
      userName: organization.adminUserName,
      password: organization.adminDefaultPassword,
      reason: 'created',
    });

    return {
      message: 'Organization created successfully. Username and password have been sent to your email.',
      organizationId: organization.id,
      credentialsSent: true,
      adminUserName: organization.adminUserName,
      pricingTypeId: pricingType.typeId,
      planId: pricingPlan.id,
      planName: pricingPlan.name,
    };
  }

  async update(id: string, data: UpdateOrganizationDto, updatedBy: string) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    let settings = await this.orgSettingsRepo.findOne({
      where: { organizationId: id },
    });
    if (!settings) {
      settings = new OrganizationSettings();
      settings.organizationId = id;
      settings.resignationNoticePeriodDays = 30;
      settings.sessionStartMonth = 4;
      settings.leaveCarryForwardEnabled = false;
      settings.wfhCarryForwardEnabled = false;
    }
    const previousSessionStartMonth = Number(settings.sessionStartMonth || 4);

    if (data.name) data.organizationName = data.name;
    if (data.organizationName !== undefined) {
      org.organizationName = data.organizationName;
    }
    if (data.email !== undefined) org.email = data.email;
    if (data.hrMail !== undefined) org.hrMail = data.hrMail;
    if (data.phone !== undefined) org.phone = data.phone;
    if (data.address !== undefined) org.address = data.address;
    if (data.logoUrl !== undefined) org.logoUrl = data.logoUrl;
    if (data.homeHeaderBackgroundColor !== undefined) {
      settings.homeHeaderBackgroundColor = this.normalizeNullableText(
        data.homeHeaderBackgroundColor,
      );
    }
    if (data.homeHeaderMediaUrl !== undefined) {
      settings.homeHeaderMediaUrl = this.normalizeNullableText(data.homeHeaderMediaUrl);
    }
    if (data.homeHeaderMediaStartDate !== undefined) {
      settings.homeHeaderMediaStartDate = this.normalizeNullableText(
        data.homeHeaderMediaStartDate,
      );
    }
    if (data.homeHeaderMediaEndDate !== undefined) {
      settings.homeHeaderMediaEndDate = this.normalizeNullableText(
        data.homeHeaderMediaEndDate,
      );
    }
    if (data.resignationPolicy !== undefined) {
      settings.resignationPolicy = this.normalizeNullableText(data.resignationPolicy);
    }
    if (data.resignationNoticePeriodDays !== undefined) {
      settings.resignationNoticePeriodDays = Number(data.resignationNoticePeriodDays) || 0;
    }
    if (data.allowEarlyRelievingByAdmin !== undefined) {
      settings.allowEarlyRelievingByAdmin = data.allowEarlyRelievingByAdmin;
    }

    if (data.sessionStartMonth !== undefined) {
      settings.sessionStartMonth = Number(data.sessionStartMonth);
    }
    if (data.leaveCarryForwardEnabled !== undefined) {
      settings.leaveCarryForwardEnabled = Boolean(data.leaveCarryForwardEnabled);
    }
    if (data.wfhCarryForwardEnabled !== undefined) {
      settings.wfhCarryForwardEnabled = Boolean(data.wfhCarryForwardEnabled);
    }

    org.updatedBy = updatedBy;
    await this.orgRepo.save(org);
    await this.orgSettingsRepo.save(settings);

    // When session start month changes, rollover leave/WFH balances automatically.
    if (
      data.sessionStartMonth !== undefined &&
      Number(data.sessionStartMonth) !== Number(previousSessionStartMonth)
    ) {
      await this.leaveService.rolloverOrganizationBalances(
        id,
        Boolean(settings.leaveCarryForwardEnabled),
      );
      await this.wfhService.rolloverOrganizationBalances(
        id,
        Boolean(settings.wfhCarryForwardEnabled),
      );
    }

    return this.findOne(id);
  }

  async changeCredentials(orgId: string, adminUserId: string, dto: ChangeCredentialsDto) {
    const user = await this.userRepo.findOne({ where: { id: adminUserId, organizationId: orgId } });
    if (!user) throw new NotFoundException('Admin user not found');

    if (dto.newUserName) {
      const existing = await this.userRepo.findOne({ where: { userName: dto.newUserName } });
      if (existing && existing.id !== adminUserId) {
        throw new BadRequestException('Username already taken');
      }
      user.userName = dto.newUserName;
    }

    if (dto.newPassword) {
      user.password = await bcrypt.hash(dto.newPassword, 12);
      user.mustChangePassword = false;
    }

    return this.userRepo.save(user);
  }

  async delete(id: string) {
    const org = await this.orgRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    try {
      await this.orgRepo.manager.transaction(async (manager) => {
        const [{ schema }] = await manager.query('SELECT current_schema() AS schema');

        // Delete all rows from organization-scoped tables first to avoid FK violations.
        const orgScopedTables: Array<{ table_schema: string; table_name: string }> =
          await manager.query(
            `
              SELECT table_schema, table_name
              FROM information_schema.columns
              WHERE column_name = 'organization_id'
                AND table_schema = $1
                AND table_name <> 'organizations'
            `,
            [schema],
          );

        for (const { table_schema, table_name } of orgScopedTables) {
          await manager.query(
            `DELETE FROM "${table_schema}"."${table_name}" WHERE organization_id = $1`,
            [id],
          );
        }

        await manager.query(
          `DELETE FROM "${schema}"."organizations" WHERE organization_id = $1`,
          [id],
        );
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Unable to delete organization due to linked records: ${error?.message || 'unknown error'}`,
      );
    }

    return { message: 'Organization deleted successfully' };
  }

  async findAll() {
    const organizations = await this.orgRepo.find();
    return organizations.map((org) => this.mapOrganizationResponse(org));
  }

  async findOne(id: string) {
    const org = await this.orgRepo.findOne({
      where: { id },
      relations: ['users', 'organizationFeatures'],
    });
    if (!org) throw new NotFoundException('Organization not found');
    return this.mapOrganizationResponse(org);
  }

  private mapOrganizationResponse(org: Organization) {
    return {
      ...org,
      name: org.organizationName,
      homeHeaderBackgroundColor: org.settings?.homeHeaderBackgroundColor || null,
      homeHeaderMediaUrl: org.settings?.homeHeaderMediaUrl || null,
      homeHeaderMediaStartDate: org.settings?.homeHeaderMediaStartDate || null,
      homeHeaderMediaEndDate: org.settings?.homeHeaderMediaEndDate || null,
      resignationPolicy: org.settings?.resignationPolicy || null,
      resignationNoticePeriodDays: org.settings?.resignationNoticePeriodDays ?? 30,
      allowEarlyRelievingByAdmin:
        org.settings?.allowEarlyRelievingByAdmin ?? false,
      sessionStartMonth: Number(org.settings?.sessionStartMonth || 4),
      leaveCarryForwardEnabled: Boolean(org.settings?.leaveCarryForwardEnabled),
      wfhCarryForwardEnabled: Boolean(org.settings?.wfhCarryForwardEnabled),
    };
  }
}
