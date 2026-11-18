import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { UserActivitiesService } from '../services/user-activities.service';
import { CreateUserActivityDto } from '../dto/user-actvities.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import { User } from '../entities/user.entity';

@Controller('user-activities')
@UseGuards(JwtAuthGuard)
export class UserActivitiesController {
  constructor(private readonly userActivitiesService: UserActivitiesService) {}

  @Post()
  async create(@Body() createUserActivityDto: CreateUserActivityDto) {
    return this.userActivitiesService.create(createUserActivityDto);
  }

  @Get()
  async getAllUsers(
    @Query('limit') limit = 10,
    @Query('offset') offset = 0,
    @Query('search') search?: string,
    @Query('sortField') sortField = 'user_name',
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC' = 'ASC',
    @Query('organizationId') organizationId?: string,
    @GetUser() user?: User,
  ) {
    const orgId = organizationId || user?.organizationId;
    return this.userActivitiesService.findAll(
      Number(limit),
      Number(offset),
      search,
      sortField,
      sortOrder,
      orgId,
    );
  }
}
