import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Organization } from '../entities/organization.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { JwtPayload, ResetPasswordDto } from '../dto/auth.dto';
import { RoleType } from '../enums/role-type.enum';
import { UserActivitiesService } from './user-activities.service';
import { TimeslipApproval } from 'src/modules/workflow/timeslip/entities/timeslip-approval.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { LeaveApprovalAssignment } from 'src/modules/leave/entities/leave-approval-assignment.entity';
import { WfhApprovalAssignment } from 'src/modules/wfh/entities/wfh-approval-assignment.entity';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { StorageService } from 'src/modules/attendance/storage.service';
import { MailService } from 'src/modules/mail/mail.service';

export interface UserWithRoles extends User {
  roles: { id: string; roleName: string }[];
  permissions: { id: string; permissionName: string }[];
}

interface AdminResetTarget {
  user: User;
  otpEmail: string;
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userActivitiesService: UserActivitiesService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private userRoleRepository: Repository<UserRole>,
    @InjectRepository(TimeslipApproval)
    private timeslipApprovalRepository: Repository<TimeslipApproval>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveApprovalAssignment)
    private leaveApprovalAssignmentRepository: Repository<LeaveApprovalAssignment>,
    @InjectRepository(WfhApprovalAssignment)
    private wfhApprovalAssignmentRepository: Repository<WfhApprovalAssignment>,
    private storageService: StorageService,
    private mailService: MailService,
  ) {}

  // Generate JWT after successful login
  async login(user: UserWithRoles) {
    const payload: JwtPayload = {
      userId: user.id,
      userName: user.userName,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      gender: user.gender,
      dob: user.dob,
      email: user.email,
      mobileNumber: user.mobileNumber ?? null,
      organizationId:
        user.organization?.id || '00000000-0000-0000-0000-000000000000',
      roles: user.roles,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  // Check if user is an approver
  async checkIsApprover(
    userId: string,
    organizationId?: string | null,
  ): Promise<boolean> {
    try {
      const employee = await this.employeeRepository.findOne({
        where: organizationId ? { userId, organizationId } : { userId },
      });

      if (!employee) {
        return false;
      }

      const [
        timeslipApproval,
        hasDirectReports,
        leaveApprovalAssignment,
        wfhApprovalAssignment,
      ] = await Promise.all([
        this.timeslipApprovalRepository.findOne({
          where: { approver_id: employee.id },
        }),
        this.employeeRepository.findOne({
          where: { reportingTo: employee.id },
          select: ['id'],
        }),
        this.leaveApprovalAssignmentRepository.findOne({
          where: { approver: { id: userId }, isActive: true },
        }),
        this.wfhApprovalAssignmentRepository.findOne({
          where: { approver: { id: userId }, isActive: true },
        }),
      ]);

      return Boolean(
        timeslipApproval ||
          hasDirectReports ||
          leaveApprovalAssignment ||
          wfhApprovalAssignment,
      );
    } catch {
      return false;
    }
  }

  // Get enhanced profile with isApprover flag
  async getEnhancedProfile(user: any): Promise<any> {
    const [isApprover, employee] = await Promise.all([
      this.checkIsApprover(user.userId, user.organizationId ?? null),
      this.employeeRepository.findOne({
        where: user.organizationId
          ? { userId: user.userId, organizationId: user.organizationId }
          : { userId: user.userId },
      }),
    ]);

    let avatar: string | null = null;
    if (employee) {
      const key = employee.passportPhotoUrl || employee.photoUrl || null;
      if (key) {
        if (/^(https?:)?\/\//i.test(key) || key.startsWith('data:')) {
          avatar = key;
        } else {
          try {
            avatar = await this.storageService.getSignedUrl(key);
          } catch {
            avatar = key; // fallback to raw key
          }
        }
      }
    }

    return {
      ...user,
      avatar,
      isApprover,
      employee: employee
        ? {
            ...employee,
            photoUrl: avatar || employee.photoUrl || null,
            passportPhotoUrl: avatar || employee.passportPhotoUrl || null,
          }
        : employee,
    };
  }

  // Validate user credentials
  async validateUser(
    userName: string,
    password: string,
    clientInfo: any,
  ): Promise<User | null> {
    const { raw, entities } = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.organization', 'organization')
      .leftJoin('user.userRoles', 'userRole', 'userRole.isActive = :isActive', {
        isActive: true,
      })
      .leftJoin('userRole.role', 'role')
      .leftJoin(
        'role.rolePermissions',
        'rolePermission',
        'rolePermission.isActive = :isActive',
        { isActive: true },
      )
      .leftJoin('rolePermission.permission', 'permission')
      .addSelect(['organization.id'])
      .addSelect(['role.id', 'role.roleName'])
      .addSelect(['permission.id', 'permission.permissionName'])
      .where('user.userName = :userName', { userName })
      .getRawAndEntities();

    if (!entities || entities.length === 0) {
      return null;
    }

    const user = entities[0];

    // Extract unique roles
    const roles = raw
      .filter((r) => r.role_role_id)
      .map((r) => ({ id: r.role_role_id, roleName: r.role_role_name }))
      .filter((r, i, self) => self.findIndex((x) => x.id === r.id) === i);

    user['roles'] = roles;

    // Extract unique permissions granted via any of the user's active roles
    const permissions = raw
      .filter((r) => r.permission_permission_id)
      .map((r) => ({
        id: r.permission_permission_id,
        permissionName: r.permission_permission_name,
      }))
      .filter((p, i, self) => self.findIndex((x) => x.id === p.id) === i);

    user['permissions'] = permissions;

    const latestEmployee = await this.employeeRepository.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (latestEmployee?.organizationId) {
      const previousOrganizationId =
        user.organizationId ?? user.organization?.id;
      user.organizationId = latestEmployee.organizationId;
      user.organization = { id: latestEmployee.organizationId } as any;

      if (previousOrganizationId !== latestEmployee.organizationId) {
        await this.userRepository
          .createQueryBuilder()
          .update(User)
          .set({ organizationId: latestEmployee.organizationId })
          .where('id = :id', { id: user.id })
          .execute();
      }
    }

    if (user && (await bcrypt.compare(password, user.password))) {
      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({
          lastLoginAt: () => 'NOW()',
        })
        .where('id = :id', { id: user.id })
        .execute();

      await this.userActivitiesService.create({
        userId: user.id,
        activityType: 'LOGIN',
        activityDescription: 'User logged in successfully.',
        metadata: clientInfo,
        module: 'Auth',
        actionTaken: 'Login',
        performedBy: user.id,
        isSuccess: true,
      });

      return user;
    }

    return null;
  }

  async logout(userId: string, clientInfo?: any): Promise<void> {
    try {
      const userExists = await this.userRepository.findOne({
        where: { id: userId },
      });
      if (userExists) {
        await this.userActivitiesService.create({
          userId,
          activityType: 'LOGOUT',
          activityDescription: 'User logged out successfully.',
          metadata: clientInfo,
          module: 'Auth',
          actionTaken: 'Logout',
          performedBy: userId,
          isSuccess: true,
        });
      }
    } catch (err) {
      // Silently catch seeder/stale session FK issues so logout does not fail
    }
  }

  async sendAdminPasswordResetOtp(identifier: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const target = await this.findAdminResetTarget(normalizedIdentifier);

    if (!target) {
      throw new NotFoundException(
        'No admin account found for this email or user ID',
      );
    }

    const { user, otpEmail } = target;
    const otp = String(randomInt(100000, 1000000));
    user.passwordResetOtpHash = await bcrypt.hash(otp, 12);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepository.save(user);

    await this.mailService.sendPasswordResetOtp({
      organizationId: user.organizationId,
      email: otpEmail,
      name:
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.userName,
      otp,
      expiresInMinutes: 10,
    });

    return { message: 'OTP sent to registered admin email' };
  }

  async resetAdminCredentials(dto: ResetPasswordDto) {
    const normalizedIdentifier = dto.identifier.trim().toLowerCase();
    const newUserName = dto.newUserName.trim();
    const target = await this.findAdminResetTarget(normalizedIdentifier);

    if (!target) {
      throw new NotFoundException(
        'No admin account found for this email or user ID',
      );
    }

    const { user } = target;
    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      throw new BadRequestException(
        'Request a new OTP before resetting credentials',
      );
    }

    if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP expired. Request a new OTP');
    }

    const isValidOtp = await bcrypt.compare(
      dto.otp.trim(),
      user.passwordResetOtpHash,
    );
    if (!isValidOtp) {
      throw new BadRequestException('Invalid OTP');
    }

    const existingUserName = await this.userRepository.findOne({
      where: { userName: newUserName },
      select: ['id'],
    });

    if (existingUserName && existingUserName.id !== user.id) {
      throw new ConflictException('User ID already exists');
    }

    user.userName = newUserName;
    user.password = await bcrypt.hash(dto.newPassword, 12);
    user.mustChangePassword = false;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    await this.userRepository.save(user);

    return { message: 'Admin user ID and password updated successfully' };
  }

  private async findAdminResetTarget(
    identifier: string,
  ): Promise<AdminResetTarget | null> {
    const organization = await this.organizationRepository
      .createQueryBuilder('organization')
      .where(
        `(
          LOWER(organization.email) = :identifier
          OR LOWER(organization.hrMail) = :identifier
        )`,
        { identifier },
      )
      .getOne();

    if (organization) {
      const adminUser = await this.findOrCreateOrganizationAdmin(
        organization,
        identifier,
      );

      return {
        user: adminUser,
        otpEmail: this.getOrganizationResetEmail(organization, identifier),
      };
    }

    const activeAdmin = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.organization', 'organization')
      .leftJoin('user.userRoles', 'userRole', 'userRole.isActive = :isActive', {
        isActive: true,
      })
      .leftJoin('userRole.role', 'role')
      .where(
        `(
          LOWER(user.email) = :identifier
          OR LOWER(user.userName) = :identifier
        )`,
        { identifier },
      )
      .andWhere('user.isActive = :userActive', { userActive: true })
      .andWhere('role.roleName IN (:...roleNames)', {
        roleNames: ['ADMIN', 'SUPERADMIN'],
      })
      .getOne();

    if (activeAdmin) {
      return {
        user: activeAdmin,
        otpEmail: this.getResetOtpEmail(activeAdmin, identifier),
      };
    }

    return null;
  }

  private getResetOtpEmail(user: User, identifier: string): string {
    const organization = user.organization;
    const orgEmail = organization?.email?.trim().toLowerCase();
    const orgHrMail = organization?.hrMail?.trim().toLowerCase();

    if (orgEmail && orgEmail === identifier) {
      return organization.email?.trim() || user.email;
    }

    if (orgHrMail && orgHrMail === identifier) {
      return organization.hrMail?.trim() || user.email;
    }

    return user.email;
  }

  private getOrganizationResetEmail(
    organization: Organization,
    identifier: string,
  ): string {
    const orgEmail = organization.email?.trim();
    const orgHrMail = organization.hrMail?.trim();

    if (orgEmail?.toLowerCase() === identifier) {
      return orgEmail;
    }

    if (orgHrMail?.toLowerCase() === identifier) {
      return orgHrMail;
    }

    return orgEmail || orgHrMail || '';
  }

  private async findOrCreateOrganizationAdmin(
    organization: Organization,
    identifier: string,
  ): Promise<User> {
    const activeAdmin = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('employees', 'employee', 'employee.user_id = user.user_id')
      .leftJoin('user.userRoles', 'userRole', 'userRole.isActive = :isActive', {
        isActive: true,
      })
      .leftJoin('userRole.role', 'role')
      .where('user.organizationId = :organizationId', {
        organizationId: organization.id,
      })
      .andWhere('user.isActive = :userActive', { userActive: true })
      .andWhere('role.roleName = :roleName', { roleName: 'ADMIN' })
      .andWhere('employee.id IS NULL')
      .orderBy('user.createdAt', 'ASC')
      .getOne();

    if (activeAdmin) {
      return activeAdmin;
    }

    const adminRole = await this.getOrCreateAdminRole(organization.id);
    const otpEmail = this.getOrganizationResetEmail(organization, identifier);
    const existingUserWithOtpEmail = otpEmail
      ? await this.userRepository.findOne({
          where: { email: otpEmail },
          select: ['id'],
        })
      : null;

    const adminEmail = existingUserWithOtpEmail
      ? await this.getAvailableInternalAdminEmail(organization.id)
      : otpEmail ||
        (await this.getAvailableInternalAdminEmail(organization.id));

    const adminUser = await this.userRepository.save(
      this.userRepository.create({
        userName: await this.getAvailableAdminUserName(organization.id),
        email: adminEmail,
        password: await bcrypt.hash(String(randomInt(100000, 1000000)), 12),
        firstName: 'Admin',
        lastName: '',
        organization,
        organizationId: organization.id,
        isActive: true,
        mustChangePassword: true,
      }),
    );

    await this.userRoleRepository.save(
      this.userRoleRepository.create({
        user: adminUser,
        role: adminRole,
        isActive: true,
      }),
    );

    return adminUser;
  }

  private async getOrCreateAdminRole(organizationId: string): Promise<Role> {
    let adminRole = await this.roleRepository
      .createQueryBuilder('role')
      .where('role.roleName = :roleName', { roleName: 'ADMIN' })
      .andWhere(
        '(role.organizationId = :organizationId OR role.organizationId IS NULL)',
        {
          organizationId,
        },
      )
      .orderBy(
        'CASE WHEN role.organizationId = :organizationId THEN 0 ELSE 1 END',
        'ASC',
      )
      .setParameter('organizationId', organizationId)
      .getOne();

    if (!adminRole) {
      adminRole = await this.roleRepository.save(
        this.roleRepository.create({
          roleName: 'ADMIN',
          type: RoleType.DEFAULT,
          description: 'System administrator',
          organizationId,
        }),
      );
    }

    return adminRole;
  }

  private async getAvailableAdminUserName(
    organizationId: string,
  ): Promise<string> {
    const base = `admin_${organizationId.slice(0, 8)}`;
    let candidate = base;
    let suffix = 2;

    while (
      await this.userRepository.findOne({
        where: { userName: candidate },
        select: ['id'],
      })
    ) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private async getAvailableInternalAdminEmail(
    organizationId: string,
  ): Promise<string> {
    const base = `admin+${organizationId}@avinya.local`;
    let candidate = base;
    let suffix = 2;

    while (
      await this.userRepository.findOne({
        where: { email: candidate },
        select: ['id'],
      })
    ) {
      candidate = `admin+${organizationId}-${suffix}@avinya.local`;
      suffix += 1;
    }

    return candidate;
  }
}
