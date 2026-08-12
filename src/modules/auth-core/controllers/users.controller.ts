import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateRegisterDto } from '../dto/register.dto';
import { UpdateFcmTokenDto } from '../dto/update-fcm-token.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { GetUser } from '../decorators/get-user.decorator';
import {
  SwaggerFindUserIdByDOB,
  SwaggerRegisterUser,
  SwaggerCreateUser,
  SwaggerGetAllUsers,
  SwaggerGetUserById,
  SwaggerUpdateUser,
  SwaggerDeleteUser,
} from '../docs/users.swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Public: used for pre-auth username recovery / self-registration flows.
  @Post('useridbydob')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SwaggerFindUserIdByDOB()
  userIdByDOB(@Body() body: { name: string; dob: string }) {
    return this.usersService.findUserIDbyDOB(body.name, body.dob);
  }

  // Public: issues a randomized OTP for the pending registration.
  @Post('register/request-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  requestRegisterOtp(
    @Body() body: { channel: 'mobile' | 'email'; value: string },
  ) {
    if (body.channel !== 'mobile' && body.channel !== 'email') {
      throw new ForbiddenException('Invalid OTP channel');
    }
    if (!body.value || !String(body.value).trim()) {
      throw new ForbiddenException('A phone number or email is required');
    }
    return this.usersService.requestRegisterOtp(body.channel, body.value);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SwaggerRegisterUser()
  async register(@Body() createRegisterDto: CreateRegisterDto) {
    return this.usersService.register(createRegisterDto);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @SwaggerCreateUser()
  create(
    @Body() createUserDto: CreateUserDto,
    @GetUser()
    actor: { organizationId?: string; roles?: { roleName: string }[] },
  ) {
    const isSuperadmin = actor?.roles?.some((r) => r.roleName === 'SUPERADMIN');
    if (!isSuperadmin && actor?.organizationId) {
      (createUserDto as any).organizationId = actor.organizationId;
    }
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @SwaggerGetAllUsers()
  async getAllUsers(
    @GetUser()
    actor: { organizationId?: string; roles?: { roleName: string }[] },
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
    @Query('search') search?: string,
    @Query('sortField') sortField = 'user_name',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
  ) {
    const isSuperadmin = actor?.roles?.some((r) => r.roleName === 'SUPERADMIN');
    return this.usersService.findAll(
      Number(limit),
      Number(offset),
      search,
      sortField,
      sortOrder,
      actor?.organizationId,
      isSuperadmin,
    );
  }

  @Get(':user_id')
  @UseGuards(JwtAuthGuard)
  @SwaggerGetUserById()
  findOne(
    @Param('user_id', ParseUUIDPipe) user_id: string,
    @GetUser()
    actor: { organizationId?: string; roles?: { roleName: string }[] },
  ) {
    const isSuperadmin = actor?.roles?.some((r) => r.roleName === 'SUPERADMIN');
    return this.usersService.findOne(
      user_id,
      actor?.organizationId,
      isSuperadmin,
    );
  }

  // Registered before ':user_id' so 'fcm-token' isn't swallowed by that param route.
  @Patch('fcm-token')
  @UseGuards(JwtAuthGuard)
  updateFcmToken(
    @GetUser() user: { userId?: string; id?: string },
    @Body() dto: UpdateFcmTokenDto,
  ) {
    const userId = user?.userId || user?.id;
    return this.usersService.updateFcmToken(
      userId as string,
      dto.token,
      dto.platform,
    );
  }

  @Patch(':user_id')
  @UseGuards(JwtAuthGuard)
  @SwaggerUpdateUser()
  update(
    @Param('user_id', ParseUUIDPipe) user_id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser()
    actor: {
      userId?: string;
      id?: string;
      organizationId?: string;
      roles?: { roleName: string }[];
    },
  ) {
    return this.usersService.update(user_id, updateUserDto, actor);
  }

  @Delete(':user_id')
  @UseGuards(JwtAuthGuard)
  @SwaggerDeleteUser()
  remove(
    @Param('user_id', ParseUUIDPipe) user_id: string,
    @GetUser()
    actor: {
      userId?: string;
      id?: string;
      organizationId?: string;
      roles?: { roleName: string }[];
    },
  ) {
    return this.usersService.remove(user_id, actor);
  }
}
