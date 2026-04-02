import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../dto/auth.dto';
import { UserActivitiesService } from './user-activities.service';
import { TimeslipApproval } from 'src/modules/workflow/timeslip/entities/timeslip-approval.entity';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { LeaveApprovalAssignment } from 'src/modules/leave/entities/leave-approval-assignment.entity';
import { WfhApprovalAssignment } from 'src/modules/wfh/entities/wfh-approval-assignment.entity';
import * as bcrypt from 'bcrypt';
import { StorageService } from 'src/modules/attendance/storage.service';

export interface UserWithRoles extends User {
  roles: { id: string; roleName: string }[];
  permissions: { id: string; permissionName: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userActivitiesService: UserActivitiesService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(TimeslipApproval)
    private timeslipApprovalRepository: Repository<TimeslipApproval>,
    @InjectRepository(Employee)
    private employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveApprovalAssignment)
    private leaveApprovalAssignmentRepository: Repository<LeaveApprovalAssignment>,
    @InjectRepository(WfhApprovalAssignment)
    private wfhApprovalAssignmentRepository: Repository<WfhApprovalAssignment>,
    private storageService: StorageService,
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
      organizationId: user.organization.id,
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

      const [timeslipApproval, hasDirectReports, leaveApprovalAssignment, wfhApprovalAssignment] =
        await Promise.all([
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
      .addSelect(['organization.id'])
      .addSelect(['role.id', 'role.roleName'])
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

    const latestEmployee = await this.employeeRepository.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (latestEmployee?.organizationId) {
      const previousOrganizationId = user.organizationId ?? user.organization?.id;
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
}
