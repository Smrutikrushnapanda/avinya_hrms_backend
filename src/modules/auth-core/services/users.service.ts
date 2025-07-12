import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserActivitiesService } from './user-activities.service';
import { CreateRegisterDto } from '../dto/register.dto';
import { RolesService } from './roles.service';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly userActivitiesService: UserActivitiesService,
    private rolesService: RolesService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.userRepository.save(user);
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
      mobileOtpId,
      mobileOTP,
      emailOtpId,
      emailOTP,
    } = createRegisterDto;

    const expectedOTP = 123456;
    if (mobileOTP !== expectedOTP || emailOTP !== expectedOTP) {
      throw new BadRequestException('OTP is not valid');
    }

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
  ): Promise<{ data: User[]; total: number }> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.roleId = :role', {
        role: 'APPLICANT',
      });

    if (search) {
      qb.andWhere(
        `
        user.id ILIKE :search OR
        user.userName ILIKE :search OR
        user.name ILIKE :search
      `,
        { search: `%${search}%` },
      );
    }

    const sortFieldMap: Record<string, string> = {
      userId: 'user.id',
      userName: 'user.userName',
      name: 'user.name',
    };

    const sortColumn = sortFieldMap[sortField] || 'user.userName';

    const [data, total] = await qb
      .orderBy(sortColumn, sortOrder)
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException(`User with ID ${userId} not found`);
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
        `User with name ${name} and DOB ${dob} not found`,
      );
    }
    return user;
  }

  async update(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(userId);
    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async remove(userId: string): Promise<{ message: string }> {
    const result = await this.userRepository.delete(userId);
    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return { message: `User with ID ${userId} deleted successfully` };
  }
}
