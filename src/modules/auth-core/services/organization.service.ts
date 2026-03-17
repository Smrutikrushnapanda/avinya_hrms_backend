import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { OrganizationSettings } from '../entities/organization-settings.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { CreateOrganizationDto, UpdateOrganizationDto, ChangeCredentialsDto } from '../dto/organization.dto';
import { RoleType } from '../enums/role-type.enum';
import { LeaveService } from '../../leave/leave.service';
import { WfhService } from '../../wfh/wfh.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationSettings)
    private readonly orgSettingsRepo: Repository<OrganizationSettings>,
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
  ) {}

  private normalizeNullableText(value?: string | null): string | null {
    if (value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
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
    const hashedPassword = await bcrypt.hash('password', 12);
    const adminUser = await this.userRepo.save(
      this.userRepo.create({
        userName: 'avinya_hrms',
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

    return { ...org, adminUserName: 'avinya_hrms', adminDefaultPassword: 'password' };
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
    await this.orgRepo.remove(org);
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
