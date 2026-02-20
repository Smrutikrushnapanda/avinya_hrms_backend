import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Timesheet } from './entities/timesheet.entity';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { Employee } from 'src/modules/employee/entities/employee.entity';
import { ManagerRemarkDto } from './dto/manager-remark.dto';

type TimesheetQuery = {
  organizationId: string;
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  limit: number;
};

@Injectable()
export class TimesheetService {
  private readonly maxBackdatedDays = 7;

  constructor(
    @InjectRepository(Timesheet)
    private timesheetRepo: Repository<Timesheet>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
  ) {}

  private formatDateLocal(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private parseDateOnly(dateStr: string): Date {
    const [y, m, d] = (dateStr || '').split('T')[0].split('-').map(Number);
    if (!y || !m || !d) {
      throw new BadRequestException('Invalid timesheet date');
    }
    return new Date(y, m - 1, d);
  }

  private assertDateWithinRange(dateStr: string) {
    const dateOnly = this.parseDateOnly(dateStr);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - dateOnly.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (dateOnly.getTime() > today.getTime()) {
      throw new BadRequestException('Timesheet date cannot be in the future');
    }

    if (diffDays > this.maxBackdatedDays) {
      throw new BadRequestException(
        `Timesheet date can only be backdated up to ${this.maxBackdatedDays} days`,
      );
    }
  }

  async createTimesheet(dto: CreateTimesheetDto) {
    this.assertDateWithinRange(dto.date);

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, organizationId: dto.organizationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found in organization');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end time');
    }
    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }

    const workingMinutes = Math.max(0, Math.floor((+end - +start) / 60000));

    const dateOnly = this.formatDateLocal(this.parseDateOnly(dto.date));

    const existing = await this.timesheetRepo.findOne({
      where: {
        organizationId: dto.organizationId,
        employeeId: dto.employeeId,
        date: dateOnly,
      },
    });

    if (existing) {
      existing.startTime = start;
      existing.endTime = end;
      existing.workingMinutes = workingMinutes;
      existing.projectName = dto.projectName ?? null;
      existing.clientName = dto.clientName ?? null;
      existing.workDescription = dto.workDescription;
      existing.employeeRemark = dto.employeeRemark ?? null;
      return this.timesheetRepo.save(existing);
    }

    const timesheet = this.timesheetRepo.create({
      organizationId: dto.organizationId,
      employeeId: dto.employeeId,
      date: dateOnly,
      startTime: start,
      endTime: end,
      workingMinutes,
      projectName: dto.projectName ?? null,
      clientName: dto.clientName ?? null,
      workDescription: dto.workDescription,
      employeeRemark: dto.employeeRemark ?? null,
    });

    return this.timesheetRepo.save(timesheet);
  }

  async listTimesheets(query: TimesheetQuery) {
    const { organizationId, employeeId, fromDate, toDate, page, limit } = query;

    const qb = this.timesheetRepo
      .createQueryBuilder('ts')
      .leftJoinAndSelect('ts.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .leftJoinAndSelect('employee.manager', 'manager')
      .where('ts.organizationId = :organizationId', { organizationId });

    if (employeeId) {
      qb.andWhere('ts.employeeId = :employeeId', { employeeId });
    }

    if (fromDate && toDate) {
      qb.andWhere('ts.date BETWEEN :fromDate AND :toDate', { fromDate, toDate });
    }

    qb.orderBy('ts.date', 'DESC');

    const [results, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async addManagerRemark(id: string, dto: ManagerRemarkDto) {
    const timesheet = await this.timesheetRepo.findOne({ where: { id } });
    if (!timesheet) {
      throw new NotFoundException('Timesheet not found');
    }

    timesheet.managerRemark = dto.remark;
    timesheet.managerId = dto.managerId;
    return this.timesheetRepo.save(timesheet);
  }
}
