import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateRegisterDto } from '../dto/register.dto';
import {
  ApiTags,
} from '@nestjs/swagger';
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

  @Post('useridbydob')
  @SwaggerFindUserIdByDOB()
  userIdByDOB(@Body() body: { name: string; dob: string }) {
    return this.usersService.findUserIDbyDOB(body.name, body.dob);
  }

  @Post('register')
  @SwaggerRegisterUser()
  async register(@Body() createRegisterDto: CreateRegisterDto) {
    return this.usersService.register(createRegisterDto);
  }

  @Post()
  @SwaggerCreateUser()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @SwaggerGetAllUsers()
  async getAllUsers(
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
    @Query('search') search?: string,
    @Query('sortField') sortField = 'user_name',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
  ) {
    return this.usersService.findAll(
      Number(limit),
      Number(offset),
      search,
      sortField,
      sortOrder,
    );
  }

  /*@Get('get-users-by-center')
  @ApiOperation({ summary: 'Find all assigned applicants by center code' })
  @ApiQuery({ name: 'center_code', required: true, type: String, example: 'C001' })
  @ApiResponse({ status: 200, description: 'Applicants assigned to center' })
  findAllAssignedApplicantsByCenter(@Query('center_code') center_code: string) {
    return this.usersService.findAllAssignedApplicantsByCenter(center_code);
  }*/

  @Get(':user_id')
  @SwaggerGetUserById()
  findOne(@Param('user_id') user_id: string) {
    return this.usersService.findOne(user_id);
  }

  @Patch(':user_id')
  @SwaggerUpdateUser()
  update(
    @Param('user_id') user_id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(user_id, updateUserDto);
  }

  @Delete(':user_id')
  @SwaggerDeleteUser()
  remove(@Param('user_id') user_id: string) {
    return this.usersService.remove(user_id);
  }
}
