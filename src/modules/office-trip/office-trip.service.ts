import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OfficeTripRequest,
  OfficeTripStatus,
  OfficeTripType,
} from './entities/office-trip-request.entity';
import { Employee } from '../employee/entities/employee.entity';
import {
  CreateOfficeTripDto,
  UpdateOfficeTripStatusDto,
} from './dto/create-office-trip.dto';

export interface OfficeTripFilters {
  employeeId?: string;
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  tripType?: string;
}

@Injectable()
export class OfficeTripService {
  constructor(
    @InjectRepository(OfficeTripRequest)
    private tripRepo: Repository<OfficeTripRequest>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
  ) {}

  /**
   * `users.firstName/lastName` is the raw login identity and often left at
   * its account-creation default. Overlay accurate names from the
   * `employees` HR table in place, mirroring ExpensesService.
   */
  private async overlayEmployeeNames(
    users: Array<
      | {
          id: string;
          firstName?: string;
          middleName?: string;
          lastName?: string;
        }
      | null
      | undefined
    >,
  ): Promise<void> {
    const userIds = [
      ...new Set(
        users
          .filter(
            (
              u,
            ): u is {
              id: string;
              firstName?: string;
              middleName?: string;
              lastName?: string;
            } => !!u,
          )
          .map((u) => u.id),
      ),
    ];
    if (userIds.length === 0) return;

    const employees = await this.employeeRepo
      .createQueryBuilder('employee')
      .where('employee.userId IN (:...userIds)', { userIds })
      .select([
        'employee.userId',
        'employee.firstName',
        'employee.middleName',
        'employee.lastName',
      ])
      .getMany();

    const nameByUserId = new Map(
      employees
        .filter((e) => e.firstName)
        .map((e) => [
          e.userId,
          {
            firstName: e.firstName,
            middleName: e.middleName,
            lastName: e.lastName,
          },
        ]),
    );

    for (const user of users) {
      if (!user) continue;
      const resolved = nameByUserId.get(user.id);
      if (resolved) {
        user.firstName = resolved.firstName;
        user.middleName = resolved.middleName;
        user.lastName = resolved.lastName;
      }
    }
  }

  async createTrip(
    userId: string,
    dto: CreateOfficeTripDto,
  ): Promise<OfficeTripRequest> {
    if (dto.toDate < dto.fromDate) {
      throw new BadRequestException('To Date cannot be before From Date');
    }
    if (dto.tripType === OfficeTripType.OTHER && !dto.tripTypeOther?.trim()) {
      throw new BadRequestException(
        'Please specify the trip type when selecting "Other"',
      );
    }

    const trip = this.tripRepo.create({
      userId,
      organizationId: dto.organizationId,
      tripType: dto.tripType,
      tripTypeOther: dto.tripTypeOther ?? null,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      clientOfficeName: dto.clientOfficeName,
      location: dto.location,
      purpose: dto.purpose,
      description: dto.description ?? null,
      attachments: dto.attachments ?? [],
      status: OfficeTripStatus.PENDING,
    });
    return this.tripRepo.save(trip);
  }

  async getMyTrips(userId: string): Promise<OfficeTripRequest[]> {
    return this.tripRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllTrips(
    organizationId: string,
    filters: OfficeTripFilters,
  ): Promise<OfficeTripRequest[]> {
    const query = this.tripRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .leftJoinAndSelect('t.approvedBy', 'approver')
      .where('t.organization_id = :organizationId', { organizationId })
      .orderBy('t.createdAt', 'DESC');

    if (filters.employeeId) {
      query.andWhere('t.user_id = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (filters.departmentId) {
      const employees = await this.employeeRepo.find({
        where: { organizationId, departmentId: filters.departmentId },
        select: ['userId'],
      });
      const userIds = employees.map((e) => e.userId);
      query.andWhere('t.user_id IN (:...deptUserIds)', {
        deptUserIds: userIds.length
          ? userIds
          : ['00000000-0000-0000-0000-000000000000'],
      });
    }

    if (filters.dateFrom) {
      query.andWhere('t.to_date >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      query.andWhere('t.from_date <= :dateTo', { dateTo: filters.dateTo });
    }
    if (filters.status) {
      query.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters.tripType) {
      query.andWhere('t.trip_type = :tripType', { tripType: filters.tripType });
    }

    const trips = await query.getMany();
    await this.overlayEmployeeNames(trips.map((t) => t.user));
    return trips;
  }

  async getTripById(id: string): Promise<OfficeTripRequest> {
    const trip = await this.tripRepo.findOne({
      where: { id },
      relations: ['user', 'approvedBy'],
    });
    if (!trip) throw new NotFoundException('Office trip request not found');
    await this.overlayEmployeeNames([trip.user]);
    return trip;
  }

  async updateStatus(
    id: string,
    approverUserId: string,
    dto: UpdateOfficeTripStatusDto,
  ): Promise<OfficeTripRequest> {
    const trip = await this.tripRepo.findOne({ where: { id } });
    if (!trip) throw new NotFoundException('Office trip request not found');
    if (trip.status !== OfficeTripStatus.PENDING) {
      throw new BadRequestException(
        'This request has already been decided and cannot be changed',
      );
    }

    trip.status = dto.status;
    trip.adminRemarks = dto.adminRemarks ?? null;
    trip.approvedBy = { id: approverUserId } as any;
    trip.approvedAt = new Date();
    return this.tripRepo.save(trip);
  }

  async deleteTrip(id: string, userId: string): Promise<void> {
    const trip = await this.tripRepo.findOne({ where: { id, userId } });
    if (!trip) throw new NotFoundException('Office trip request not found');
    if (trip.status !== OfficeTripStatus.PENDING) {
      throw new BadRequestException(
        'Only a pending request can be deleted — approved requests cannot be edited, submit a new request instead',
      );
    }
    await this.tripRepo.delete(id);
  }
}
