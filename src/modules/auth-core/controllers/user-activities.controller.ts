import {
  Controller,
  Get,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { UserActivitiesService } from '../services/user-activities.service';
import { CreateUserActivityDto } from '../dto/user-actvities.dto';

@Controller('user-activities')
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
  ) {
    return this.userActivitiesService.findAll(
      Number(limit),
      Number(offset),
      search,
      sortField,
      sortOrder,
    );
  }
}