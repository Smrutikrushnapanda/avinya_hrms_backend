import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhHeartbeatSnapshot } from './entities/wfh-heartbeat-snapshot.entity';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';

@Injectable()
export class WfhMonitoringService {
  constructor(
    @InjectRepository(WfhActivityLog)
    private activityRepo: Repository<WfhActivityLog>,
    @InjectRepository(WfhHeartbeatSnapshot)
    private snapshotRepo: Repository<WfhHeartbeatSnapshot>,
    @InjectRepository(WfhRequest)
    private wfhRequestRepo: Repository<WfhRequest>,
  ) {}

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async hasApprovedWfhToday(userId: string): Promise<boolean> {
    const today = this.today();
    const req = await this.wfhRequestRepo
      .createQueryBuilder('req')
      .where('req.user.id = :userId', { userId })
      .andWhere('req.status = :status', { status: 'APPROVED' })
      .andWhere('req.date <= :today', { today })
      .andWhere('(req.endDate IS NULL OR req.endDate >= :today)', { today })
      .getOne();
    return !!req;
  }

  async heartbeat(userId: string, organizationId: string, dto: HeartbeatDto) {
    const date = dto.date ?? this.today();

    // 1. Update the daily aggregate log
    let log = await this.activityRepo.findOne({
      where: { user: { id: userId }, date },
    });

    if (!log) {
      log = this.activityRepo.create({
        user: { id: userId },
        date,
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
      });
    }

    log.mouseEvents += dto.mouseEvents;
    log.keyboardEvents += dto.keyboardEvents;
    log.tabSwitches += dto.tabSwitches;
    log.lastActiveAt = new Date();
    await this.activityRepo.save(log);

    // 2. Save a time-series snapshot for chart rendering
    if (dto.mouseEvents > 0 || dto.keyboardEvents > 0 || dto.tabSwitches > 0) {
      const snapshot = this.snapshotRepo.create({
        user: { id: userId },
        organizationId,
        date,
        mouseEvents: dto.mouseEvents,
        keyboardEvents: dto.keyboardEvents,
        tabSwitches: dto.tabSwitches,
      });
      await this.snapshotRepo.save(snapshot);
    }

    return { success: true };
  }

  async toggleLunch(userId: string) {
    const date = this.today();

    let log = await this.activityRepo.findOne({
      where: { user: { id: userId }, date },
    });

    if (!log) {
      log = this.activityRepo.create({
        user: { id: userId },
        date,
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
      });
    }

    // Enforce a single lunch session per day: once ended, it cannot be started again.
    if (!log.isLunch && log.lunchEnd) {
      throw new BadRequestException('Lunch break already ended for today');
    }

    if (!log.isLunch) {
      log.isLunch = true;
      log.lunchStart = new Date();
      log.lunchEnd = null;
    } else {
      log.isLunch = false;
      log.lunchEnd = new Date();
    }

    await this.activityRepo.save(log);
    return { isLunch: log.isLunch, lunchStart: log.lunchStart, lunchEnd: log.lunchEnd };
  }

  async toggleWork(userId: string) {
    const date = this.today();

    let log = await this.activityRepo.findOne({
      where: { user: { id: userId }, date },
    });

    if (!log) {
      log = this.activityRepo.create({
        user: { id: userId },
        date,
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
      });
    }

    if (!log.workStartedAt) {
      // Start work
      log.workStartedAt = new Date();
      log.workEndedAt = null;
    } else if (!log.workEndedAt) {
      // End work
      log.workEndedAt = new Date();
    } else {
      // Resume work (restart session)
      log.workStartedAt = new Date();
      log.workEndedAt = null;
    }

    await this.activityRepo.save(log);
    return {
      workStartedAt: log.workStartedAt,
      workEndedAt: log.workEndedAt,
      isWorking: !!log.workStartedAt && !log.workEndedAt,
    };
  }

  async getMyToday(userId: string) {
    const date = this.today();
    const [log, hasApprovedWfh] = await Promise.all([
      this.activityRepo.findOne({ where: { user: { id: userId }, date } }),
      this.hasApprovedWfhToday(userId),
    ]);

    const base = log ?? {
      mouseEvents: 0,
      keyboardEvents: 0,
      tabSwitches: 0,
      lastActiveAt: null,
      isLunch: false,
      lunchStart: null,
      lunchEnd: null,
      workStartedAt: null,
      workEndedAt: null,
    };

    return {
      ...base,
      hasApprovedWfh,
      isWorking: !!(base.workStartedAt && !base.workEndedAt),
    };
  }

  async getEmployeeActivity(employeeUserId: string, date?: string) {
    const targetDate = date ?? this.today();
    const log = await this.activityRepo.findOne({
      where: { user: { id: employeeUserId }, date: targetDate },
      relations: ['user'],
    });
    // Return zero-state instead of 404 so admin page can still render the row
    return log ?? {
      mouseEvents: 0,
      keyboardEvents: 0,
      tabSwitches: 0,
      lastActiveAt: null,
      isLunch: false,
      lunchStart: null,
      lunchEnd: null,
      workStartedAt: null,
      workEndedAt: null,
    };
  }

  /**
   * Returns time-bucketed chart data (30-min buckets) for all WFH employees in the org.
   * Response shape: { buckets: string[], employees: { userId, name, email, mouse, keyboard, tabs }[] }
   */
  async getChartData(organizationId: string, date?: string) {
    const targetDate = date ?? this.today();

    // Build 30-min time buckets for a full working day (00:00 → 23:30)
    const buckets: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        buckets.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }

    const snapshots = await this.snapshotRepo
      .createQueryBuilder('snap')
      .leftJoinAndSelect('snap.user', 'user')
      .where('snap.organizationId = :orgId', { orgId: organizationId })
      .andWhere('snap.date = :date', { date: targetDate })
      .select([
        'snap.id',
        'snap.mouseEvents',
        'snap.keyboardEvents',
        'snap.tabSwitches',
        'snap.createdAt',
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
      ])
      .orderBy('snap.createdAt', 'ASC')
      .getMany();

    // Group snapshots by user
    const userMap = new Map<string, {
      userId: string;
      name: string;
      email: string;
      bucketData: Record<string, { mouse: number; keyboard: number; tabs: number }>;
    }>();

    for (const snap of snapshots) {
      const uid = snap.user.id;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          name: [snap.user.firstName, snap.user.lastName].filter(Boolean).join(' ') || snap.user.email,
          email: snap.user.email,
          bucketData: {},
        });
      }

      // Bucket the snapshot by the nearest 30-min slot
      const d = new Date(snap.createdAt);
      const hh = d.getHours();
      const mm = d.getMinutes() < 30 ? 0 : 30;
      const bucket = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

      const entry = userMap.get(uid)!;
      if (!entry.bucketData[bucket]) {
        entry.bucketData[bucket] = { mouse: 0, keyboard: 0, tabs: 0 };
      }
      entry.bucketData[bucket].mouse += snap.mouseEvents;
      entry.bucketData[bucket].keyboard += snap.keyboardEvents;
      entry.bucketData[bucket].tabs += snap.tabSwitches;
    }

    // Convert to arrays aligned to buckets
    const employees = Array.from(userMap.values()).map((emp) => ({
      userId: emp.userId,
      name: emp.name,
      email: emp.email,
      mouse: buckets.map((b) => emp.bucketData[b]?.mouse ?? 0),
      keyboard: buckets.map((b) => emp.bucketData[b]?.keyboard ?? 0),
      tabs: buckets.map((b) => emp.bucketData[b]?.tabs ?? 0),
    }));

    return { buckets, employees };
  }

  async getTeamActivity(organizationId: string, date?: string) {
    const targetDate = date ?? this.today();

    // 1. Find all users with approved WFH for this date in the org
    const approvedRequests = await this.wfhRequestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.user', 'user')
      .where('user.organizationId = :orgId', { orgId: organizationId })
      .andWhere('req.status = :status', { status: 'APPROVED' })
      .andWhere('req.date <= :date', { date: targetDate })
      .andWhere('(req.endDate IS NULL OR req.endDate >= :date)', { date: targetDate })
      .select(['req.id', 'user.id', 'user.email', 'user.firstName', 'user.lastName'])
      .getMany();

    if (approvedRequests.length === 0) return [];

    const userIds = approvedRequests.map((r) => r.user.id);

    // 2. Get existing activity logs for those users on this date
    const logs = await this.activityRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .where('log.date = :date', { date: targetDate })
      .andWhere('log.user.id IN (:...userIds)', { userIds })
      .select([
        'log.id',
        'log.date',
        'log.mouseEvents',
        'log.keyboardEvents',
        'log.tabSwitches',
        'log.lastActiveAt',
        'log.isLunch',
        'log.lunchStart',
        'log.lunchEnd',
        'log.workStartedAt',
        'log.workEndedAt',
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
      ])
      .getMany();

    const logMap = new Map(logs.map((l) => [l.user.id, l]));

    // 3. Merge — return activity log if available, else a zero-state row
    return approvedRequests.map((req) => {
      const log = logMap.get(req.user.id);
      if (log) return log;
      return {
        id: `pending-${req.user.id}`,
        date: targetDate,
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
        lastActiveAt: null,
        isLunch: false,
        lunchStart: null,
        lunchEnd: null,
        workStartedAt: null,
        workEndedAt: null,
        user: req.user,
      };
    });
  }
}
