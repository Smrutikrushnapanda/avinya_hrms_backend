import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { CreateOrganizationDto, UpdateOrganizationDto, ChangeCredentialsDto } from '../dto/organization.dto';
import { RoleType } from '../enums/role-type.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  async create(data: CreateOrganizationDto, createdBy: string) {
    const org = await this.orgRepo.save(
      this.orgRepo.create({ ...data, createdBy, updatedBy: createdBy }),
    );

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

    if (data.name) data.organizationName = data.name;
    if (data.email !== undefined) org.email = data.email;
    if (data.hrMail !== undefined) org.hrMail = data.hrMail;
    if (data.phone !== undefined) org.phone = data.phone;
    if (data.address !== undefined) org.address = data.address;
    if (data.logoUrl !== undefined) org.logoUrl = data.logoUrl;
    if (data.resignationPolicy !== undefined) org.resignationPolicy = data.resignationPolicy;
    if (data.resignationNoticePeriodDays !== undefined) {
      org.resignationNoticePeriodDays = Number(data.resignationNoticePeriodDays) || 0;
    }
    if (data.allowEarlyRelievingByAdmin !== undefined) {
      org.allowEarlyRelievingByAdmin = data.allowEarlyRelievingByAdmin;
    }

    Object.assign(org, data, { updatedBy });
    return this.orgRepo.save(org);
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
    return this.orgRepo.find();
  }

  async findOne(id: string) {
    const org = await this.orgRepo.findOne({
      where: { id },
      relations: ['users', 'organizationFeatures'],
    });
    if (!org) throw new NotFoundException('Organization not found');
    return { ...org, name: org.organizationName };
  }
}
