import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Timesheet, TimesheetWorkStatus } from './entities/timesheet.entity';
import { CreateTimesheetDto, TimesheetEntryFieldsDto } from './dto/create-timesheet.dto';
import { CreateTimesheetBatchDto } from './dto/create-timesheet-batch.dto';
import { UpdateTimesheetDto } from './dto/update-timesheet.dto';
import { ApproveTimesheetDayDto } from './dto/approve-timesheet-day.dto';
import { Employee } from 'src/modules/employee/entities/employee.entity';

type TimesheetQuery = {
  organizationId: string;
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  projectName?: string;
  page: number;
  limit: number;
};

type ManagerTimesheetQuery = {
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  projectName?: string;
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

  private today(): string {
    return this.formatDateLocal(new Date());
  }

  /** Resolves the acting user's Employee.id (timesheets are employee-keyed; JWT only carries userId). */
  async resolveEmployeeId(userId: string, organizationId: string): Promise<string> {
    const employee = await this.employeeRepo.findOne({
      where: { userId, organizationId },
      select: ['id'],
    });
    if (!employee) {
      throw new NotFoundException('No employee record found for the current user');
    }
    return employee.id;
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

  private parseEntryTimes(
    entry: { startTime: string; endTime: string },
    label: string,
  ): { start: Date; end: Date } {
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException(`${label}: invalid start or end time`);
    }
    if (end <= start) {
      throw new BadRequestException(`${label}: end time must be after start time`);
    }
    return { start, end };
  }

  private async assertNoOverlap(
    employeeId: string,
    date: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.timesheetRepo
      .createQueryBuilder('ts')
      .where('ts.employeeId = :employeeId', { employeeId })
      .andWhere('ts.date = :date', { date })
      .andWhere('ts.startTime < :end', { end })
      .andWhere('ts.endTime > :start', { start });

    if (excludeId) {
      qb.andWhere('ts.id != :excludeId', { excludeId });
    }

    const conflict = await qb.getOne();
    if (conflict) {
      throw new BadRequestException(
        `This time range overlaps with an existing entry (${conflict.startTime.toISOString()} - ${conflict.endTime.toISOString()})`,
      );
    }
  }

  private buildEntry(
    base: { organizationId: string; employeeId: string; date: string },
    entry: TimesheetEntryFieldsDto,
    start: Date,
    end: Date,
  ) {
    const workingMinutes =
      entry.workingMinutes ?? Math.max(0, Math.floor((+end - +start) / 60000));

    return this.timesheetRepo.create({
      organizationId: base.organizationId,
      employeeId: base.employeeId,
      date: base.date,
      startTime: start,
      endTime: end,
      workingMinutes,
      projectName: entry.projectName ?? null,
      clientName: entry.clientName ?? null,
      moduleFeature: entry.moduleFeature ?? null,
      pageScreen: entry.pageScreen ?? null,
      workDescription: entry.workDescription,
      workStatus: entry.workStatus ?? TimesheetWorkStatus.COMPLETED,
      employeeRemark: entry.employeeRemark ?? null,
    });
  }

  async createTimesheet(dto: CreateTimesheetDto) {
    this.assertDateWithinRange(dto.date);

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, organizationId: dto.organizationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found in organization');
    }

    const { start, end } = this.parseEntryTimes(dto, 'Entry');
    const dateOnly = this.formatDateLocal(this.parseDateOnly(dto.date));

    await this.assertNoOverlap(dto.employeeId, dateOnly, start, end);

    const timesheet = this.buildEntry(
      { organizationId: dto.organizationId, employeeId: dto.employeeId, date: dateOnly },
      dto,
      start,
      end,
    );
    return this.timesheetRepo.save(timesheet);
  }

  async createTimesheetBatch(dto: CreateTimesheetBatchDto) {
    this.assertDateWithinRange(dto.date);

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId, organizationId: dto.organizationId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found in organization');
    }

    const dateOnly = this.formatDateLocal(this.parseDateOnly(dto.date));

    const parsed = dto.entries.map((entry, index) => ({
      entry,
      ...this.parseEntryTimes(entry, `Row ${index + 1}`),
    }));

    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const a = parsed[i];
        const b = parsed[j];
        if (a.start < b.end && a.end > b.start) {
          throw new BadRequestException(
            `Row ${i + 1} and row ${j + 1} have overlapping time ranges`,
          );
        }
      }
    }

    for (const { start, end } of parsed) {
      await this.assertNoOverlap(dto.employeeId, dateOnly, start, end);
    }

    const queryRunner = this.timesheetRepo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const saved: Timesheet[] = [];
      for (const { entry, start, end } of parsed) {
        const row = this.buildEntry(
          { organizationId: dto.organizationId, employeeId: dto.employeeId, date: dateOnly },
          entry,
          start,
          end,
        );
        saved.push(await queryRunner.manager.save(row));
      }
      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateTimesheet(
    id: string,
    requestingEmployeeId: string,
    dto: UpdateTimesheetDto,
  ) {
    const entry = await this.timesheetRepo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Timesheet entry not found');
    }
    if (entry.employeeId !== requestingEmployeeId) {
      throw new ForbiddenException('You can only edit your own timesheet entries');
    }
    if (entry.date !== this.today()) {
      throw new ForbiddenException("Only today's timesheet entries can be edited");
    }

    const start = dto.startTime ? new Date(dto.startTime) : entry.startTime;
    const end = dto.endTime ? new Date(dto.endTime) : entry.endTime;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end time');
    }
    if (end <= start) {
      throw new BadRequestException('End time must be after start time');
    }
    await this.assertNoOverlap(entry.employeeId, entry.date, start, end, entry.id);

    entry.startTime = start;
    entry.endTime = end;
    entry.workingMinutes =
      dto.workingMinutes ?? Math.max(0, Math.floor((+end - +start) / 60000));
    if (dto.projectName !== undefined) entry.projectName = dto.projectName ?? null;
    if (dto.clientName !== undefined) entry.clientName = dto.clientName ?? null;
    if (dto.moduleFeature !== undefined) entry.moduleFeature = dto.moduleFeature ?? null;
    if (dto.pageScreen !== undefined) entry.pageScreen = dto.pageScreen ?? null;
    if (dto.workDescription !== undefined) entry.workDescription = dto.workDescription;
    if (dto.workStatus !== undefined) entry.workStatus = dto.workStatus;
    if (dto.employeeRemark !== undefined) entry.employeeRemark = dto.employeeRemark ?? null;

    return this.timesheetRepo.save(entry);
  }

  async deleteTimesheet(id: string, requestingEmployeeId: string) {
    const entry = await this.timesheetRepo.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Timesheet entry not found');
    }
    if (entry.employeeId !== requestingEmployeeId) {
      throw new ForbiddenException('You can only delete your own timesheet entries');
    }
    if (entry.date !== this.today()) {
      throw new ForbiddenException("Only today's timesheet entries can be deleted");
    }

    await this.timesheetRepo.remove(entry);
    return { success: true };
  }

  async listTimesheets(query: TimesheetQuery) {
    const { organizationId, employeeId, fromDate, toDate, status, projectName, page, limit } =
      query;

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
    if (status) {
      qb.andWhere('ts.approvalStatus = :status', { status });
    }
    if (projectName) {
      qb.andWhere('ts.projectName = :projectName', { projectName });
    }

    qb.orderBy('ts.date', 'DESC').addOrderBy('ts.startTime', 'ASC');

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

  async getManagerTimesheets(managerEmployeeId: string, query: ManagerTimesheetQuery) {
    const { employeeId, fromDate, toDate, status, projectName, page, limit } = query;

    const directReports = await this.employeeRepo.find({
      where: { reportingTo: managerEmployeeId },
      select: ['id'],
    });
    const reportIds = directReports.map((e) => e.id);

    if (reportIds.length === 0) {
      return {
        results: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      };
    }

    let scopedEmployeeIds = reportIds;
    if (employeeId) {
      if (!reportIds.includes(employeeId)) {
        throw new ForbiddenException(
          'You can only view timesheets for your direct reports',
        );
      }
      scopedEmployeeIds = [employeeId];
    }

    const qb = this.timesheetRepo
      .createQueryBuilder('ts')
      .leftJoinAndSelect('ts.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoinAndSelect('employee.designation', 'designation')
      .where('ts.employeeId IN (:...scopedEmployeeIds)', { scopedEmployeeIds });

    if (fromDate && toDate) {
      qb.andWhere('ts.date BETWEEN :fromDate AND :toDate', { fromDate, toDate });
    }
    if (status) {
      qb.andWhere('ts.approvalStatus = :status', { status });
    }
    if (projectName) {
      qb.andWhere('ts.projectName = :projectName', { projectName });
    }

    qb.orderBy('ts.date', 'DESC').addOrderBy('ts.startTime', 'ASC');

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

  async approveDay(
    actingEmployeeId: string,
    isAdminOrHr: boolean,
    dto: ApproveTimesheetDayDto,
  ) {
    if (!isAdminOrHr) {
      const isDirectReport = await this.employeeRepo.findOne({
        where: { id: dto.employeeId, reportingTo: actingEmployeeId },
      });
      if (!isDirectReport) {
        throw new ForbiddenException(
          "You are not authorized to approve this employee's timesheet",
        );
      }
    }

    const entries = await this.timesheetRepo.find({
      where: { employeeId: dto.employeeId, date: dto.date },
    });
    if (entries.length === 0) {
      throw new NotFoundException('No timesheet entries found for that employee/date');
    }

    const now = new Date();
    for (const entry of entries) {
      entry.approvalStatus = dto.approvalStatus;
      entry.managerRemark = dto.remark ?? null;
      entry.managerId = actingEmployeeId;
      entry.approvedAt = now;
    }
    await this.timesheetRepo.save(entries);

    return { updated: entries.length, approvalStatus: dto.approvalStatus };
  }
}
