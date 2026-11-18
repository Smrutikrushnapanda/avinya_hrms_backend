import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserActivityDto } from '../dto/user-actvities.dto';
import { UserActivity } from '../entities/user-actvities.entity';
import { LogReportService } from '../../log-report/log-report.service';
import { getFullName } from '../../../shared/name.util';

@Injectable()
export class UserActivitiesService {
  constructor(
    @InjectRepository(UserActivity)
    private readonly userActivityRepo: Repository<UserActivity>,
    private readonly logReportService: LogReportService,
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
    organizationId?: string,
  ): Promise<{ data: any[]; total: number }> {
    const queryBuilder = this.userActivityRepo
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.user', 'user');

    if (organizationId) {
      queryBuilder.andWhere('user.organization_id = :organizationId', {
        organizationId,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        `(activity.activity_type ILIKE :search 
       OR activity.module ILIKE :search 
       OR user.user_name ILIKE :search 
       OR user.firstName ILIKE :search 
       OR user.lastName ILIKE :search)`,
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

    const [rawActivities, uaTotal] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    const activityList = rawActivities.map((activity) => ({
      id: activity.id,
      userName: activity.user?.userName,
      name:
        getFullName(
          activity.user?.firstName,
          activity.user?.middleName,
          activity.user?.lastName,
        ) ||
        activity.user?.userName ||
        'Employee',
      email: activity.user?.email,
      activityType: activity.activityType,
      module: activity.module || 'Auth',
      description: activity.activityDescription || activity.actionTaken || activity.activityType,
      location: activity.metadata?.location || 'Office',
      device: activity.metadata?.deviceType || 'Web App',
      loggedAt: activity.createdAt,
      timestamp: activity.createdAt,
      createdAt: activity.createdAt,
    }));

    // If organizationId is provided, also retrieve application audit interactions
    let mergedData = [...activityList];
    if (organizationId) {
      try {
        const logRes = await this.logReportService.findAll({
          organizationId,
          limit: Math.max(limit, 50),
          page: 1,
          search,
        });

        const logList = (logRes.data || []).map((log: any) => ({
          id: log.id,
          userName: log.userName,
          name: log.userName || 'Employee',
          email: undefined,
          activityType: log.actionType || 'INTERACTION',
          module: log.module ? (log.module.charAt(0).toUpperCase() + log.module.slice(1)) : 'Application',
          description: log.description || `${log.actionType} in ${log.module}`,
          location: log.ipAddress || 'Web',
          device: log.userAgent ? (log.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop') : 'Browser',
          loggedAt: log.createdAt,
          timestamp: log.createdAt,
          createdAt: log.createdAt,
        }));

        mergedData = [...activityList, ...logList];
      } catch {
        // Fall back to activityList if logReport query fails
      }
    }

    // Sort combined activities chronologically descending
    mergedData.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'ASC' ? timeA - timeB : timeB - timeA;
    });

    const paginated = mergedData.slice(0, limit);
    return { data: paginated, total: Math.max(uaTotal, mergedData.length) };
  }

  async remove(userId: string): Promise<any> {
    return this.userActivityRepo.delete({ userId });
  }
}
