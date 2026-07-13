import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhHeartbeatSnapshot } from './entities/wfh-heartbeat-snapshot.entity';
import { WfhAppActivity } from './entities/wfh-app-activity.entity';
import { WfhAppSummary } from './entities/wfh-app-summary.entity';
import { WfhMonitoringSession } from './entities/wfh-monitoring-session.entity';
import { WfhMonitoringTacAcceptance } from './entities/wfh-monitoring-tac-acceptance.entity';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LogAppActivityDto } from './dto/log-app-activity.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';
import { EmployeeWorkArrangement } from '../wfh/entities/employee-work-arrangement.entity';
import { Employee } from '../employee/entities/employee.entity';
import { AttendanceService } from '../attendance/attendance.service';
import {
  TAC_CURRENT_VERSION,
  WFH_MONITORING_TAC_TEXT,
} from './wfh-monitoring-terms.constant';

@Injectable()
export class WfhMonitoringService {
  constructor(
    @InjectRepository(WfhActivityLog)
    private activityRepo: Repository<WfhActivityLog>,
    @InjectRepository(WfhHeartbeatSnapshot)
    private snapshotRepo: Repository<WfhHeartbeatSnapshot>,
    @InjectRepository(WfhAppActivity)
    private appActivityRepo: Repository<WfhAppActivity>,
    @InjectRepository(WfhAppSummary)
    private appSummaryRepo: Repository<WfhAppSummary>,
    @InjectRepository(WfhMonitoringSession)
    private sessionRepo: Repository<WfhMonitoringSession>,
    @InjectRepository(WfhMonitoringTacAcceptance)
    private tacRepo: Repository<WfhMonitoringTacAcceptance>,
    @InjectRepository(WfhRequest)
    private wfhRequestRepo: Repository<WfhRequest>,
    @InjectRepository(EmployeeWorkArrangement)
    private workArrangementRepo: Repository<EmployeeWorkArrangement>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    private attendanceService: AttendanceService,
  ) {}

  /**
   * The `employees` table (HR profile, kept up to date via the Employees
   * admin form) is the accurate name source; `users.firstName/lastName`
   * is the raw login identity and is often left at its account-creation
   * default. Prefer the employee record's name when one exists.
   */
  private async resolveDisplayNames(
    userIds: string[],
  ): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
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

    return new Map(
      employees
        .filter((e) => e.firstName)
        .map((e) => [
          e.userId,
          [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' '),
        ]),
    );
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private async hasApprovedWfhToday(userId: string): Promise<boolean> {
    const today = this.today();
    const req = await this.wfhRequestRepo
      .createQueryBuilder('req')
      .where('req.user_id = :userId', { userId })
      .andWhere('req.status = :status', { status: 'APPROVED' })
      .andWhere('req.date <= :today', { today })
      .andWhere('(req.endDate IS NULL OR req.endDate >= :today)', { today })
      .getOne();
    if (req) return true;

    // PERMANENT_REMOTE employees never file a per-day request — every
    // working day is implicitly WFH-approved.
    const arrangement = await this.workArrangementRepo.findOne({
      where: { user: { id: userId }, isActive: true },
      relations: ['user'],
    });
    if (arrangement?.arrangementType !== 'PERMANENT_REMOTE') return false;

    const organizationId = arrangement.user?.organizationId;
    if (!organizationId) return false;

    const shiftConfig = await this.attendanceService.resolveShiftConfig(
      organizationId,
      userId,
    );
    return this.attendanceService.isWorkingDayForDate(new Date(), shiftConfig);
  }

  /**
   * Org-wide equivalent of `hasApprovedWfhToday`: every user (with basic
   * identity fields) who is WFH-approved on `date` — ad-hoc approved
   * `wfh_requests`, plus PERMANENT_REMOTE employees on a working day.
   * Single source of truth for the admin/manager team-activity views
   * below, which previously each re-ran their own inline copy of the
   * `wfh_requests` query and silently missed PERMANENT_REMOTE employees.
   */
  private async getApprovedWfhUsersForOrg(
    organizationId: string,
    date: string,
  ): Promise<
    Array<{ id: string; email?: string; firstName?: string; lastName?: string }>
  > {
    const byUserId = new Map<
      string,
      { id: string; email?: string; firstName?: string; lastName?: string }
    >();

    const approvedRequests = await this.wfhRequestRepo
      .createQueryBuilder('req')
      .leftJoinAndSelect('req.user', 'user')
      .where('user.organizationId = :orgId', { orgId: organizationId })
      .andWhere('req.status = :status', { status: 'APPROVED' })
      .andWhere('req.date <= :date', { date })
      .andWhere('(req.endDate IS NULL OR req.endDate >= :date)', { date })
      .select([
        'req.id',
        'user.id',
        'user.email',
        'user.firstName',
        'user.lastName',
      ])
      .getMany();
    for (const req of approvedRequests) {
      if (req.user?.id) byUserId.set(req.user.id, req.user);
    }

    const permanentRemote = await this.workArrangementRepo
      .createQueryBuilder('arrangement')
      .leftJoinAndSelect('arrangement.user', 'user')
      .where('user.organizationId = :orgId', { orgId: organizationId })
      .andWhere('arrangement.arrangementType = :type', {
        type: 'PERMANENT_REMOTE',
      })
      .andWhere('arrangement.isActive = true')
      .getMany();
    const referenceDate = new Date(`${date}T00:00:00`);
    for (const arrangement of permanentRemote) {
      const userId = arrangement.user?.id;
      if (!userId || byUserId.has(userId)) continue;
      const shiftConfig = await this.attendanceService.resolveShiftConfig(
        organizationId,
        userId,
      );
      if (
        this.attendanceService.isWorkingDayForDate(referenceDate, shiftConfig)
      ) {
        byUserId.set(userId, arrangement.user);
      }
    }

    return [...byUserId.values()];
  }

  private async getOrCreateTodayLog(userId: string): Promise<WfhActivityLog> {
    const date = this.today();
    let log = await this.activityRepo.findOne({
      where: { user: { id: userId }, date },
    });

    if (!log) {
      log = this.activityRepo.create({
        user: { id: userId } as any,
        date,
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
      });
    }
    return log;
  }

  private async ensureWorkStarted(userId: string): Promise<WfhActivityLog> {
    const log = await this.getOrCreateTodayLog(userId);
    if (!log.workStartedAt || log.workEndedAt) {
      log.workStartedAt = new Date();
      log.workEndedAt = null;
      await this.activityRepo.save(log);
    }
    return log;
  }

  private async ensureWorkEnded(
    userId: string,
  ): Promise<WfhActivityLog | null> {
    const log = await this.activityRepo.findOne({
      where: { user: { id: userId }, date: this.today() },
    });
    if (log?.workStartedAt && !log.workEndedAt) {
      log.workEndedAt = new Date();
      await this.activityRepo.save(log);
    }
    return log;
  }

  async heartbeat(userId: string, organizationId: string, dto: HeartbeatDto) {
    const date = dto.date ?? this.today();

    // 1. Update the daily aggregate log
    const log = await this.getOrCreateTodayLog(userId);

    log.mouseEvents += dto.mouseEvents;
    log.keyboardEvents += dto.keyboardEvents;
    log.tabSwitches += dto.tabSwitches;
    log.lastActiveAt = new Date();
    await this.activityRepo.save(log);

    // 2. Save a time-series snapshot for chart rendering
    if (dto.mouseEvents > 0 || dto.keyboardEvents > 0 || dto.tabSwitches > 0) {
      const snapshot = this.snapshotRepo.create({
        user: { id: userId } as any,
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
    const log = await this.getOrCreateTodayLog(userId);

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
    return {
      isLunch: log.isLunch,
      lunchStart: log.lunchStart,
      lunchEnd: log.lunchEnd,
    };
  }

  async toggleWork(userId: string) {
    const log = await this.getOrCreateTodayLog(userId);
    const isActive = !!log.workStartedAt && !log.workEndedAt;

    const updated = isActive
      ? await this.ensureWorkEnded(userId)
      : await this.ensureWorkStarted(userId);

    return {
      workStartedAt: updated?.workStartedAt ?? null,
      workEndedAt: updated?.workEndedAt ?? null,
      isWorking: !!(updated?.workStartedAt && !updated?.workEndedAt),
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
    return (
      log ?? {
        mouseEvents: 0,
        keyboardEvents: 0,
        tabSwitches: 0,
        lastActiveAt: null,
        isLunch: false,
        lunchStart: null,
        lunchEnd: null,
        workStartedAt: null,
        workEndedAt: null,
      }
    );
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
        buckets.push(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        );
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
    const userMap = new Map<
      string,
      {
        userId: string;
        name: string;
        email: string;
        bucketData: Record<
          string,
          { mouse: number; keyboard: number; tabs: number }
        >;
      }
    >();

    for (const snap of snapshots) {
      const uid = snap.user.id;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          name:
            [snap.user.firstName, snap.user.lastName]
              .filter(Boolean)
              .join(' ') || snap.user.email,
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
    const approvedUsers = await this.getApprovedWfhUsersForOrg(
      organizationId,
      targetDate,
    );

    if (approvedUsers.length === 0) return [];

    const userIds = approvedUsers.map((u) => u.id);

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
    return approvedUsers.map((user) => {
      const log = logMap.get(user.id);
      if (log) return log;
      return {
        id: `pending-${user.id}`,
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
        user,
      };
    });
  }

  // ─── Desktop app monitoring: sessions, app activity, terms ──────────────

  async startSession(userId: string) {
    const hasApprovedWfh = await this.hasApprovedWfhToday(userId);
    if (!hasApprovedWfh) {
      throw new ForbiddenException('No approved WFH request for today');
    }

    const termsStatus = await this.getTermsStatus(userId);
    if (!termsStatus.upToDate) {
      throw new ForbiddenException(
        'Please accept the current monitoring terms before starting a session',
      );
    }

    // Close out any dangling active session (e.g. app crashed without calling session/end)
    const danglingSessions = await this.sessionRepo.find({
      where: { user: { id: userId }, isActive: true },
    });
    for (const dangling of danglingSessions) {
      dangling.isActive = false;
      dangling.sessionEnd = new Date();
      await this.sessionRepo.save(dangling);
    }

    const session = this.sessionRepo.create({
      user: { id: userId } as any,
      sessionStart: new Date(),
      isActive: true,
    });
    await this.sessionRepo.save(session);

    await this.ensureWorkStarted(userId);

    return {
      sessionId: session.id,
      sessionStart: session.sessionStart,
      isActive: true,
    };
  }

  async endSession(userId: string) {
    const session = await this.sessionRepo.findOne({
      where: { user: { id: userId }, isActive: true },
      order: { sessionStart: 'DESC' },
    });

    if (session) {
      session.isActive = false;
      session.sessionEnd = new Date();
      await this.sessionRepo.save(session);
    }

    await this.ensureWorkEnded(userId);

    return {
      sessionEnd: session?.sessionEnd ?? null,
      isActive: false,
    };
  }

  /**
   * The desktop app minimizes to tray and can run for days without a
   * restart, so a session started on one day can still be `isActive` well
   * into the next. Roll it over here rather than trusting sessionStart's
   * original day — otherwise admin's per-day session view and the daily
   * WFH-approval check both keep referencing stale, days-old state instead
   * of validating fresh each day.
   */
  private async getActiveSessionForToday(
    userId: string,
  ): Promise<WfhMonitoringSession> {
    const activeSession = await this.sessionRepo.findOne({
      where: { user: { id: userId }, isActive: true },
      order: { sessionStart: 'DESC' },
    });
    if (!activeSession) {
      throw new BadRequestException(
        'No active monitoring session; call session/start first',
      );
    }

    const sessionDate = new Date(activeSession.sessionStart)
      .toISOString()
      .split('T')[0];
    if (sessionDate === this.today()) {
      return activeSession;
    }

    activeSession.isActive = false;
    activeSession.sessionEnd = new Date();
    await this.sessionRepo.save(activeSession);

    const hasApprovedWfh = await this.hasApprovedWfhToday(userId);
    if (!hasApprovedWfh) {
      throw new ForbiddenException(
        'No approved WFH request for today; monitoring session has ended.',
      );
    }

    const freshSession = this.sessionRepo.create({
      user: { id: userId } as any,
      sessionStart: new Date(),
      isActive: true,
    });
    return this.sessionRepo.save(freshSession);
  }

  async logAppActivity(
    userId: string,
    organizationId: string,
    dto: LogAppActivityDto,
  ) {
    await this.getActiveSessionForToday(userId);

    for (const entry of dto.entries) {
      const occurredAt = entry.occurredAt
        ? new Date(entry.occurredAt)
        : new Date();
      const date = entry.date ?? occurredAt.toISOString().split('T')[0];

      const activityRow = this.appActivityRepo.create({
        user: { id: userId } as any,
        organizationId,
        appName: entry.appName,
        windowTitle: entry.windowTitle ?? null,
        keystrokeCount: entry.keystrokeCount,
        mouseClicks: entry.mouseClicks,
        durationSeconds: entry.durationSeconds,
        date,
        occurredAt,
      });
      await this.appActivityRepo.save(activityRow);

      let summary = await this.appSummaryRepo.findOne({
        where: {
          user: { id: userId },
          appName: entry.appName,
          trackedDate: date,
        },
      });
      if (!summary) {
        summary = this.appSummaryRepo.create({
          user: { id: userId } as any,
          appName: entry.appName,
          trackedDate: date,
          totalKeystrokeCount: 0,
          totalMouseClicks: 0,
          totalDurationSeconds: 0,
        });
      }
      summary.totalKeystrokeCount += entry.keystrokeCount;
      summary.totalMouseClicks += entry.mouseClicks;
      summary.totalDurationSeconds += entry.durationSeconds;
      await this.appSummaryRepo.save(summary);
    }

    return { accepted: dto.entries.length };
  }

  async getAppSummary(userId: string, date?: string) {
    const targetDate = date ?? this.today();
    const rows = await this.appSummaryRepo.find({
      where: { user: { id: userId }, trackedDate: targetDate },
      order: { totalDurationSeconds: 'DESC' },
    });

    const apps = rows.map((r) => ({
      appName: r.appName,
      keystrokeCount: r.totalKeystrokeCount,
      mouseClicks: r.totalMouseClicks,
      durationSeconds: r.totalDurationSeconds,
    }));

    const totals = apps.reduce(
      (acc, app) => ({
        keystrokes: acc.keystrokes + app.keystrokeCount,
        clicks: acc.clicks + app.mouseClicks,
        durationSeconds: acc.durationSeconds + app.durationSeconds,
      }),
      { keystrokes: 0, clicks: 0, durationSeconds: 0 },
    );

    return { date: targetDate, apps, totals };
  }

  /**
   * Admin/manager view: desktop-app-sourced activity for every WFH-approved
   * employee on a given date. Distinct from getTeamActivity(), which reflects
   * the older browser-tab heartbeat mechanism.
   */
  async getTeamAppSummary(organizationId: string, date?: string) {
    const targetDate = date ?? this.today();

    const approvedUsers = await this.getApprovedWfhUsersForOrg(
      organizationId,
      targetDate,
    );

    if (approvedUsers.length === 0) return [];

    const userIds = approvedUsers.map((u) => u.id);

    const sessions = await this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where('user.id IN (:...userIds)', { userIds })
      .andWhere('CAST(session.sessionStart AS date) = :date', {
        date: targetDate,
      })
      .orderBy('session.sessionStart', 'DESC')
      .getMany();

    const latestSessionByUser = new Map<string, WfhMonitoringSession>();
    for (const session of sessions) {
      if (!latestSessionByUser.has(session.user.id)) {
        latestSessionByUser.set(session.user.id, session);
      }
    }

    const summaryRows = await this.appSummaryRepo
      .createQueryBuilder('summary')
      .leftJoinAndSelect('summary.user', 'user')
      .where('user.id IN (:...userIds)', { userIds })
      .andWhere('summary.trackedDate = :date', { date: targetDate })
      .orderBy('summary.totalDurationSeconds', 'DESC')
      .getMany();

    const appsByUser = new Map<string, typeof summaryRows>();
    for (const row of summaryRows) {
      const list = appsByUser.get(row.user.id) ?? [];
      list.push(row);
      appsByUser.set(row.user.id, list);
    }

    const displayNames = await this.resolveDisplayNames(userIds);

    return approvedUsers.map((approvedUser) => {
      const uid = approvedUser.id;
      const session = latestSessionByUser.get(uid);
      const appRows = appsByUser.get(uid) ?? [];

      const apps = appRows.map((r) => ({
        appName: r.appName,
        keystrokeCount: r.totalKeystrokeCount,
        mouseClicks: r.totalMouseClicks,
        durationSeconds: r.totalDurationSeconds,
      }));

      const totals = apps.reduce(
        (acc, app) => ({
          keystrokes: acc.keystrokes + app.keystrokeCount,
          clicks: acc.clicks + app.mouseClicks,
          durationSeconds: acc.durationSeconds + app.durationSeconds,
        }),
        { keystrokes: 0, clicks: 0, durationSeconds: 0 },
      );

      return {
        userId: uid,
        name:
          displayNames.get(uid) ||
          [approvedUser.firstName, approvedUser.lastName]
            .filter(Boolean)
            .join(' ') ||
          approvedUser.email,
        email: approvedUser.email,
        isMonitoring: session?.isActive ?? false,
        sessionStart: session?.sessionStart ?? null,
        sessionEnd: session?.sessionEnd ?? null,
        apps,
        totals,
      };
    });
  }

  /**
   * Returns the latest wfh_app_activity row for every WFH-approved employee
   * in the org. Used by the admin dashboard to show "what they're doing right now".
   */
  async getTeamCurrentActivity(organizationId: string) {
    const today = this.today();

    const approvedUsers = await this.getApprovedWfhUsersForOrg(
      organizationId,
      today,
    );

    if (approvedUsers.length === 0) return [];

    const userIds = approvedUsers.map((u) => u.id);
    const displayNames = await this.resolveDisplayNames(userIds);

    // Get latest app activity row per user (for today) — DISTINCT ON avoids fetching all rows
    const latestActivity: Array<{
      user_id: string;
      app_name: string;
      window_title: string | null;
      occurred_at: Date;
      keystroke_count: number;
      mouse_clicks: number;
    }> = await this.appActivityRepo.query(
      `SELECT DISTINCT ON (a.user_id)
              a.user_id, a.app_name, a.window_title, a.occurred_at,
              a.keystroke_count, a.mouse_clicks
       FROM wfh_app_activity a
       WHERE a.user_id = ANY($1)
         AND a.date = $2
       ORDER BY a.user_id, a.occurred_at DESC`,
      [userIds, today],
    );

    const latestPerUser = new Map<
      string,
      {
        appName: string;
        windowTitle: string | null;
        occurredAt: Date;
        keystrokeCount: number;
        mouseClicks: number;
      }
    >();
    for (const row of latestActivity) {
      latestPerUser.set(row.user_id, {
        appName: row.app_name,
        windowTitle: row.window_title,
        occurredAt: row.occurred_at,
        keystrokeCount: row.keystroke_count,
        mouseClicks: row.mouse_clicks,
      });
    }

    // Get active session status per user
    const sessions = await this.sessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where('user.id IN (:...userIds)', { userIds })
      .andWhere('session.isActive = :active', { active: true })
      .getMany();

    const activeSessionUsers = new Set(sessions.map((s) => s.user.id));

    return userIds.map((uid) => {
      const activity = latestPerUser.get(uid);
      return {
        userId: uid,
        name: displayNames.get(uid) || uid,
        isMonitoring: activeSessionUsers.has(uid),
        currentApp: activity?.appName ?? null,
        currentWindowTitle: activity?.windowTitle ?? null,
        lastActivityAt: activity?.occurredAt?.toISOString() ?? null,
        keystrokeCount: activity?.keystrokeCount ?? 0,
        mouseClicks: activity?.mouseClicks ?? 0,
      };
    });
  }

  async acceptTerms(userId: string, dto: AcceptTermsDto) {
    if (dto.tacVersion !== TAC_CURRENT_VERSION) {
      throw new BadRequestException(
        `Terms version mismatch. Current version is ${TAC_CURRENT_VERSION}.`,
      );
    }

    let record = await this.tacRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!record) {
      record = this.tacRepo.create({ user: { id: userId } as any });
    }
    record.acceptedAt = new Date();
    record.tacVersion = TAC_CURRENT_VERSION;
    await this.tacRepo.save(record);

    return {
      accepted: true,
      acceptedAt: record.acceptedAt,
      tacVersion: record.tacVersion,
    };
  }

  async getTermsStatus(userId: string) {
    const record = await this.tacRepo.findOne({
      where: { user: { id: userId } },
    });
    const accepted = !!record;
    const upToDate = accepted && record.tacVersion === TAC_CURRENT_VERSION;

    return {
      accepted,
      upToDate,
      acceptedAt: record?.acceptedAt ?? null,
      tacVersion: record?.tacVersion ?? null,
      currentVersion: TAC_CURRENT_VERSION,
    };
  }

  getTermsText() {
    return { version: TAC_CURRENT_VERSION, text: WFH_MONITORING_TAC_TEXT };
  }
}
