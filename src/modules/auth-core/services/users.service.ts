import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../entities/user.entity';
import {
  PushTokenPlatform,
  UserPushToken,
} from '../entities/user-push-token.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserActivitiesService } from './user-activities.service';
import { CreateRegisterDto } from '../dto/register.dto';
import { RolesService } from './roles.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../entities/user-role.entity';
import { LeaveRequest } from 'src/modules/leave/entities/leave-request.entity';
import { WfhRequest } from 'src/modules/wfh/entities/wfh-request.entity';
import { Attendance } from 'src/modules/attendance/entities/attendance.entity';
import { MailService } from 'src/modules/mail/mail.service';

const REGISTER_OTP_TTL_MS = 10 * 60 * 1000;
const REGISTER_OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(WfhRequest)
    private readonly wfhRequestRepository: Repository<WfhRequest>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(UserPushToken)
    private readonly userPushTokenRepository: Repository<UserPushToken>,
    private readonly userActivitiesService: UserActivitiesService,
    private rolesService: RolesService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    if (createUserDto.password && createUserDto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long.',
      );
    }
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.userRepository.save(user);
  }

  private registerOtpKey(channel: 'mobile' | 'email', value: string): string {
    return `register-otp:${channel}:${value.trim().toLowerCase()}`;
  }

  async requestRegisterOtp(
    channel: 'mobile' | 'email',
    value: string,
  ): Promise<{ success: boolean; expiryMinutes: number }> {
    const otp = Math.floor(100000 + Math.random() * 900000);
    await this.cacheManager.set(
      this.registerOtpKey(channel, value),
      { otp, attempts: 0 },
      REGISTER_OTP_TTL_MS as any,
    );
    if (channel === 'email') {
      await this.mailService.sendRegisterOtp(value, otp);
    }
    return { success: true, expiryMinutes: REGISTER_OTP_TTL_MS / 60000 };
  }

  private async verifyRegisterOtp(
    channel: 'mobile' | 'email',
    value: string,
    providedOtp: number,
  ): Promise<void> {
    const key = this.registerOtpKey(channel, value);
    const record = await this.cacheManager.get(key);

    if (!record) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }
    if (record.attempts >= REGISTER_OTP_MAX_ATTEMPTS) {
      await this.cacheManager.del(key);
      throw new BadRequestException(
        'Too many incorrect OTP attempts. Please request a new OTP.',
      );
    }
    if (record.otp !== providedOtp) {
      await this.cacheManager.set(
        key,
        { otp: record.otp, attempts: record.attempts + 1 },
        REGISTER_OTP_TTL_MS as any,
      );
      throw new BadRequestException('OTP is not valid');
    }

    await this.cacheManager.del(key);
  }

  async register(createRegisterDto: CreateRegisterDto): Promise<User> {
    const {
      firstName,
      middleName,
      lastName,
      email,
      mobileNumber,
      dob,
      gender,
      organizationId,
      mobileOTP,
      emailOTP,
    } = createRegisterDto;

    await this.verifyRegisterOtp('mobile', mobileNumber, mobileOTP);
    await this.verifyRegisterOtp('email', email, emailOTP);

    const randomPassword = randomBytes(12)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12);
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    const user = this.userRepository.create({
      firstName,
      middleName,
      lastName,
      email,
      userName: mobileNumber,
      mobileNumber,
      password: hashedPassword,
      dob,
      gender,
      organization: { id: organizationId },
      mustChangePassword: false,
    });

    try {
      const savedUser = await this.userRepository.save(user);

      // Assign default role
      await this.rolesService.assignRoleToUser({
        userId: savedUser.id,
        roleIds: ['bb115105-fa44-4600-8510-5e082fa61ebd'],
      });

      // Optionally send credentials via email
      // await this.mailService.sendCredentialsEmail({ ... });

      return { ...savedUser, password: randomPassword };
    } catch (error) {
      // Unique violation (PostgreSQL: 23505)
      if (
        error instanceof QueryFailedError &&
        (error as any).code === '23505'
      ) {
        // Get constraint info if you want
        let field = 'unique field';
        if ((error as any).detail) {
          if ((error as any).detail.includes('email')) field = 'email';
          else if ((error as any).detail.includes('mobile'))
            field = 'mobile number';
          else if ((error as any).detail.includes('userName'))
            field = 'username';
        }
        throw new ConflictException(
          `A user with this ${field} already exists.`,
        );
      }
      throw error; // rethrow for other errors
    }
  }

  async findAll(
    limit: number,
    offset: number,
    search?: string,
    sortField: string = 'userName',
    sortOrder: 'ASC' | 'DESC' = 'ASC',
    organizationId?: string,
    isSuperadmin: boolean = false,
  ): Promise<{ data: User[]; total: number }> {
    const qb = this.userRepository.createQueryBuilder('user');

    if (search) {
      qb.andWhere(
        `
        user.userName ILIKE :search OR
        user.firstName ILIKE :search OR
        user.lastName ILIKE :search OR
        user.email ILIKE :search
      `,
        { search: `%${search}%` },
      );
    }

    if (organizationId && !isSuperadmin) {
      qb.andWhere('user.organizationId = :organizationId', { organizationId });
    }

    const sortFieldMap: Record<string, string> = {
      userId: 'user.id',
      user_name: 'user.userName',
      userName: 'user.userName',
      firstName: 'user.firstName',
      lastName: 'user.lastName',
      email: 'user.email',
      createdAt: 'user.createdAt',
    };

    const sortColumn = sortFieldMap[sortField] || 'user.userName';

    const [data, total] = await qb
      .orderBy(sortColumn, sortOrder)
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(
    userId: string,
    organizationId?: string,
    isSuperadmin: boolean = false,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
    if (!isSuperadmin && user.organizationId !== organizationId) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  async findUserIDbyDOB(firstName: string, dob: string): Promise<User> {
    const [day, month, year] = dob.split('-');
    const formattedDate = new Date(`${year}-${month}-${day}`);
    const user = await this.userRepository.findOne({
      where: {
        firstName,
        dob: formattedDate,
      },
      select: ['userName'],
    });
    if (!user) {
      throw new NotFoundException(
        `User with name ${firstName} and DOB ${dob} not found`,
      );
    }
    return user;
  }

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
    actor?: {
      userId?: string;
      id?: string;
      organizationId?: string;
      roles?: { roleName: string }[];
    },
  ): Promise<User> {
    const user = await this.findOne(userId);

    const callerId = actor?.userId || actor?.id;
    const isSuperadmin = actor?.roles?.some((r) => r.roleName === 'SUPERADMIN');
    const isAdmin = actor?.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'HR',
    );
    const isSelf = callerId === userId;

    if (!isSuperadmin && !isSelf && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to update this user.',
      );
    }
    if (
      !isSuperadmin &&
      !isSelf &&
      user.organizationId !== actor?.organizationId
    ) {
      throw new ForbiddenException(
        'You can only update users in your own organization.',
      );
    }

    if (updateUserDto.password) {
      if (updateUserDto.password.length < 8) {
        throw new BadRequestException(
          'Password must be at least 8 characters long.',
        );
      }
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    if (isSelf && !isSuperadmin && !isAdmin) {
      const allowed = { ...updateUserDto };
      delete (allowed as any).organizationId;
      delete (allowed as any).isActive;
      delete (allowed as any).isEmailVerified;
      delete (allowed as any).isMobileVerified;
      Object.assign(user, allowed);
    } else {
      Object.assign(user, updateUserDto);
    }

    return this.userRepository.save(user);
  }

  async updateFcmToken(
    userId: string,
    token: string,
    platform: PushTokenPlatform,
  ): Promise<{ success: boolean }> {
    // A token belongs to one physical device/browser install, so re-registering
    // the same token (re-login, refreshed token) must update the owner rather
    // than create a duplicate row.
    const existing = await this.userPushTokenRepository.findOne({
      where: { token },
    });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      await this.userPushTokenRepository.save(existing);
    } else {
      await this.userPushTokenRepository.save({ userId, token, platform });
    }
    return { success: true };
  }

  async remove(
    userId: string,
    actor?: {
      userId?: string;
      id?: string;
      organizationId?: string;
      roles?: { roleName: string }[];
    },
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const callerId = actor?.userId || actor?.id;
    const isSuperadmin = actor?.roles?.some((r) => r.roleName === 'SUPERADMIN');
    const isAdmin = actor?.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'HR',
    );
    const isSelf = callerId === userId;

    if (!isSuperadmin && !isSelf && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this user.',
      );
    }
    if (
      !isSuperadmin &&
      !isSelf &&
      user.organizationId !== actor?.organizationId
    ) {
      throw new ForbiddenException(
        'You can only delete users in your own organization.',
      );
    }
    if (isSelf && isAdmin && !isSuperadmin) {
      throw new ForbiddenException('Administrators cannot delete themselves.');
    }

    try {
      // Delete all leave requests
      await this.leaveRequestRepository.delete({ user: { id: userId } });

      // Delete all wfh requests
      await this.wfhRequestRepository.delete({ user: { id: userId } });

      // Delete all attendance records
      await this.attendanceRepository.delete({ user: { id: userId } });

      // Delete all user roles
      await this.userRoleRepository.delete({ user: { id: userId } });

      // Delete all user activities
      await this.userActivitiesService.remove(userId);

      // Finally, delete the user
      await this.userRepository.remove(user);

      return { message: `User with ID ${userId} deleted successfully` };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new ConflictException(
          'Cannot delete this user because they are referenced by other records.',
        );
      }
      throw error;
    }
  }
}
