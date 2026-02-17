import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { RoleType } from '../enums/role-type.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminSeederService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeederService.name);

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

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    // Check if any admin user already exists
    const existingAdmin = await this.userRoleRepo
      .createQueryBuilder('ur')
      .leftJoinAndSelect('ur.role', 'role')
      .where('role.roleName = :roleName', { roleName: 'ADMIN' })
      .getOne();

    if (existingAdmin) {
      this.logger.log('Admin user already exists, skipping seed.');
      return;
    }

    this.logger.log('No admin user found. Seeding default admin...');

    // 1. Ensure a default organization exists
    let org = await this.orgRepo.findOne({
      where: { organizationName: 'Avinya Technologies' },
    });
    if (!org) {
      org = await this.orgRepo.save(
        this.orgRepo.create({
          organizationName: 'Avinya Technologies',
          email: 'admin@avinya.com',
          isActive: true,
        }),
      );
      this.logger.log(`Created default organization: ${org.id}`);
    }

    // 2. Ensure ADMIN role exists
    let adminRole = await this.roleRepo.findOne({
      where: { roleName: 'ADMIN' },
    });
    if (!adminRole) {
      adminRole = await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'ADMIN',
          type: RoleType.DEFAULT,
          description: 'System administrator',
          organizationId: org.id,
        }),
      );
      this.logger.log(`Created ADMIN role: ${adminRole.id}`);
    }

    // 3. Ensure EMPLOYEE role exists (needed for other flows)
    let employeeRole = await this.roleRepo.findOne({
      where: { roleName: 'EMPLOYEE' },
    });
    if (!employeeRole) {
      employeeRole = await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'EMPLOYEE',
          type: RoleType.DEFAULT,
          description: 'Default employee role',
          organizationId: org.id,
        }),
      );
      this.logger.log(`Created EMPLOYEE role: ${employeeRole.id}`);
    }

    // 4. Create admin user
    const hashedPassword = await bcrypt.hash('admin@123', 12);
    const adminUser = await this.userRepo.save(
      this.userRepo.create({
        userName: 'admin',
        email: 'admin@avinya.com',
        password: hashedPassword,
        firstName: 'System',
        middleName: '',
        lastName: 'Admin',
        dob: new Date('1990-01-01'),
        gender: 'MALE',
        organization: org,
        isActive: true,
        mustChangePassword: false,
      }),
    );
    this.logger.log(`Created admin user: ${adminUser.id}`);

    // 5. Assign ADMIN role to admin user
    await this.userRoleRepo.save(
      this.userRoleRepo.create({
        user: adminUser,
        role: adminRole,
        isActive: true,
      }),
    );
    this.logger.log('Admin role assigned. Seed complete!');
    this.logger.log('Default admin credentials -> userName: "admin", password: "admin@123"');
  }
}
