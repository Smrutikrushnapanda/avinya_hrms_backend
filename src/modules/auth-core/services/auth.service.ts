import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JwtPayload } from '../dto/auth.dto';
import { UserActivitiesService } from './user-activities.service';
import * as bcrypt from 'bcrypt';

export interface UserWithRoles extends User {
  roles: { id: string; roleName: string }[];
}
@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userActivitiesService: UserActivitiesService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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
      mobileNumber: user.mobileNumber,
      organizationId: user.organization.id,
      roles: user.roles,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      access_token: this.jwtService.sign(payload),
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
      .leftJoin('user_roles', 'userRole', 'userRole.user_id = user.id')
      .leftJoin('roles', 'role', 'role.role_id = userRole.role_id')
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

    user['roles'] = roles; // temporarily attach roles for payload

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
