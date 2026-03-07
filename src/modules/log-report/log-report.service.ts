import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { LogReport } from './entities/log-report.entity';
import { LogReportSettings } from './entities/log-report-settings.entity';
import { CreateLogReportDto } from './dto/log-report.dto';

@Injectable()
export class LogReportService {
  // In-memory cache: orgId → { value, expiresAt }
  private readonly enabledCache = new Map<string, { value: boolean; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 minute

  constructor(
    @InjectRepository(LogReport)
    private readonly logRepo: Repository<LogReport>,
    @InjectRepository(LogReportSettings)
    private readonly settingsRepo: Repository<LogReportSettings>,
  ) {}

  async create(dto: CreateLogReportDto): Promise<LogReport> {
    const log = this.logRepo.create(dto);
    return this.logRepo.save(log);
  }

  async getSettings(organizationId: string): Promise<LogReportSettings> {
    let settings = await this.settingsRepo.findOne({
      where: { organizationId },
    });
    if (!settings) {
      settings = this.settingsRepo.create({ organizationId, isEnabled: true });
      settings = await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(
    organizationId: string,
    isEnabled: boolean,
  ): Promise<LogReportSettings> {
    this.enabledCache.delete(organizationId); // invalidate cache on update
    let settings = await this.settingsRepo.findOne({
      where: { organizationId },
    });
    if (!settings) {
      settings = this.settingsRepo.create({ organizationId, isEnabled });
    } else {
      settings.isEnabled = isEnabled;
    }
    return this.settingsRepo.save(settings);
  }

  async isEnabled(organizationId?: string): Promise<boolean> {
    if (!organizationId) return false;
    const cached = this.enabledCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const settings = await this.settingsRepo.findOne({ where: { organizationId } });
    const value = settings ? settings.isEnabled : true;
    this.enabledCache.set(organizationId, { value, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return value;
  }

  async findAll(params: {
    organizationId: string;
    from?: string;
    to?: string;
    userId?: string;
    actionType?: string;
    module?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      organizationId,
      from,
      to,
      userId,
      actionType,
      module,
      search,
      page = 1,
      limit = 20,
    } = params;

    const qb = this.logRepo
      .createQueryBuilder('log')
      .where('log.organizationId = :organizationId', { organizationId });

    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      qb.andWhere('log.createdAt BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (from) {
      const fromDate = new Date(from);
      qb.andWhere('log.createdAt >= :fromDate', { fromDate });
    } else if (to) {
      const toDate = new Date(to);
      qb.andWhere('log.createdAt <= :toDate', { toDate });
    }

    if (userId) {
      qb.andWhere('log.userId = :userId', { userId });
    }

    if (actionType) {
      qb.andWhere('log.actionType ILIKE :actionType', {
        actionType: `%${actionType}%`,
      });
    }

    if (module) {
      qb.andWhere('log.module ILIKE :module', { module: `%${module}%` });
    }

    if (search) {
      qb.andWhere(
        '(log.userName ILIKE :search OR log.actionType ILIKE :search OR log.module ILIKE :search OR log.description ILIKE :search OR log.ipAddress ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('log.createdAt', 'DESC');

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async delete(id: string): Promise<void> {
    const result = await this.logRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Log not found');
    }
  }
}
