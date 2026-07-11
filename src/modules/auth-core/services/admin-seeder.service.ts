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
    // Ensure SUPERADMIN role exists
    let superadminRole = await this.roleRepo.findOne({
      where: { roleName: 'SUPERADMIN' },
    });
    if (!superadminRole) {
      superadminRole = await this.roleRepo.save(
        this.roleRepo.create({
          roleName: 'SUPERADMIN',
          type: RoleType.DEFAULT,
          description: 'Global SaaS Super Administrator',
        }),
      );
      this.logger.log(`Created SUPERADMIN role: ${superadminRole.id}`);
    }

    const hashedPassword = await bcrypt.hash('password', 12);

    // Seed SUPERADMIN user if not exists
    const existingSuperadmin = await this.userRepo.findOne({
      where: { userName: 'superadmin' },
    });
    if (!existingSuperadmin) {
      this.logger.log('Seeding default superadmin...');
      const superadminUser = await this.userRepo.save(
        this.userRepo.create({
          userName: 'superadmin',
          email: 'superadmin@avinya.com',
          password: hashedPassword,
          firstName: 'Super',
          middleName: '',
          lastName: 'Admin',
          dob: new Date('1990-01-01'),
          gender: 'MALE',
          isActive: true,
          mustChangePassword: true,
        }),
      );
      await this.userRoleRepo.save(
        this.userRoleRepo.create({
          user: superadminUser,
          role: superadminRole,
          isActive: true,
        }),
      );
      this.logger.log('Superadmin user and role seeded.');
    }

    this.logger.log('Superadmin seeding validation complete.');
  }
}
