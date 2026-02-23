import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './utils/jwt.strategy';

import { OrganizationController } from './controllers/organization.controller';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { RolesController } from './controllers/roles.controller';
import { UserActivitiesController } from './controllers/user-activities.controller';

import { OrganizationService } from './services/organization.service';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { RolesService } from './services/roles.service';
import { UserActivitiesService } from './services/user-activities.service';
import { AdminSeederService } from './services/admin-seeder.service';
import { StorageService } from '../attendance/storage.service';

import { Organization } from './entities/organization.entity';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserActivity } from './entities/user-actvities.entity';
import { OrganizationRole } from './entities/organization-role.entity';
import { TimeslipApproval } from '../workflow/timeslip/entities/timeslip-approval.entity';
import { Employee } from '../employee/entities/employee.entity';
import { LogReportModule } from '../log-report/log-report.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationRole,
      User,
      Role,
      Permission,
      UserRole,
      RolePermission,
      UserActivity,
      TimeslipApproval,
      Employee,
    ]),
    LogReportModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [
    OrganizationController,
    AuthController,
    UsersController,
    RolesController,
    UserActivitiesController,
  ],
  providers: [
    JwtStrategy,
    OrganizationService,
    AuthService,
    UsersService,
    RolesService,
    UserActivitiesService,
    AdminSeederService,
    StorageService,
  ],
  exports: [OrganizationService, AuthService, UsersService, RolesService, TypeOrmModule],
})
export class AuthCoreModule {}
