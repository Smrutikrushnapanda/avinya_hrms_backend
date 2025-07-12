import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserActivityDto } from '../dto/user-actvities.dto';
import { UserActivity } from '../entities/user-actvities.entity';

@Injectable()
export class UserActivitiesService {
  constructor(
    @InjectRepository(UserActivity)
    private readonly userActivityRepo: Repository<UserActivity>,
  ) {}

  async create(dto: CreateUserActivityDto) {
    const activity = this.userActivityRepo.create(dto);
    return this.userActivityRepo.save(activity);
  }

  async findAll(
    limit: number,
    offset: number,
    search?: string,
    sortField: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: any[]; total: number }> {
    const queryBuilder = this.userActivityRepo
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.user', 'user');

    if (search) {
      queryBuilder.andWhere(
        `activity.activity_type ILIKE :search 
       OR activity.module ILIKE :search 
       OR user.user_name ILIKE :search`,
        { search: `%${search}%` },
      );
    }

    const sortFieldMap: Record<string, string> = {
      activityDescription: 'activity.activityDescription',
      module: 'activity.module',
      userId: 'activity.userId',
      createdAt: 'activity.createdAt',
      activityType: 'activity.activityType',
      performedBy: 'activity.performedBy',
      userName: 'user.userName',
    };

    const sortColumn = sortFieldMap[sortField] ?? 'activity.createdAt';

    queryBuilder.orderBy(sortColumn, sortOrder);

    const [rawData, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const data = rawData.map((activity) => ({
      userName: activity.user?.userName,
      name: `${activity.user?.firstName ?? ''} ${activity.user?.lastName ?? ''}`.trim(),
      activityType: activity.activityType,
      location: activity.metadata?.location,
      device: activity.metadata?.deviceType,
      loggedAt: activity.createdAt,
    }));

    return { data, total };
  }
}
