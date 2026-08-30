import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';
import { EmployeeWorkArrangement } from '../wfh/entities/employee-work-arrangement.entity';
import { WfhActivityLog } from './entities/wfh-activity-log.entity';
import { WfhMonitorReminderState } from './entities/wfh-monitor-reminder-state.entity';
import { OrganizationSettings } from '../auth-core/entities/organization-settings.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { MessageGateway } from '../message/message.gateway';
import { MailService } from '../mail/mail.service';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';

interface Candidate {
  userId: string;
  organizationId: string;
  email?: string | null;
  firstName?: string | null;
  today: string;
}

@Injectable()
export class WfhMonitorReminderService {
  private readonly logger = new Logger(WfhMonitorReminderService.name);

  constructor(
    @InjectRepository(WfhRequest)
    private wfhRequestRepo: Repository<WfhRequest>,
    @InjectRepository(EmployeeWorkArrangement)
    private workArrangementRepo: Repository<EmployeeWorkArrangement>,
    @InjectRepository(WfhActivityLog)
    private activityRepo: Repository<WfhActivityLog>,
    @InjectRepository(WfhMonitorReminderState)
    private reminderStateRepo: Repository<WfhMonitorReminderState>,
    @InjectRepository(OrganizationSettings)
    private orgSettingsRepo: Repository<OrganizationSettings>,
    private attendanceService: AttendanceService,
    private messageGateway: MessageGateway,
    private mailService: MailService,
    private timezoneService: OrganizationTimezoneService,
  ) {}

  /**
   * Every WFH-approved-today employee who hasn't started a monitoring
   * session yet: ad-hoc approved wfh_requests (any arrangement type) plus
   * PERMANENT_REMOTE employees on a working day (they never file a
   * per-day request).
   */
  private async findCandidates(): Promise<Candidate[]> {
    const orgRepo = this.orgSettingsRepo.manager.getRepository(Organization);
    const organizations = await orgRepo.find({ select: ['id'] });

    const byUser = new Map<string, Candidate>();
    const todayByOrg = new Map<string, string>();

    for (const org of organizations) {
      const today = await this.timezoneService.getToday(org.id);
      todayByOrg.set(org.id, today);

      const approvedRequests = await this.wfhRequestRepo
        .createQueryBuilder('req')
        .leftJoinAndSelect('req.user', 'user')
        .where('req.status = :status', { status: 'APPROVED' })
        .andWhere('req.date <= :today', { today })
        .andWhere('(req.endDate IS NULL OR req.endDate >= :today)', { today })
        .andWhere('user.organization_id = :orgId', { orgId: org.id })
        .getMany();
      for (const req of approvedRequests) {
        if (!req.user?.id || !req.user?.organizationId) continue;
        byUser.set(req.user.id, {
          userId: req.user.id,
          organizationId: req.user.organizationId,
          email: req.user.email,
          firstName: req.user.firstName,
          today,
        });
      }

      const permanentRemote = await this.workArrangementRepo.find({
        where: {
          arrangementType: 'PERMANENT_REMOTE',
          isActive: true,
          organization: { id: org.id },
        },
        relations: ['user'],
      });
      for (const arrangement of permanentRemote) {
        const userId = arrangement.user?.id;
        const organizationId = arrangement.user?.organizationId;
        if (!userId || !organizationId || byUser.has(userId)) continue;
        const shiftConfig = await this.attendanceService.resolveShiftConfig(
          organizationId,
          userId,
        );
        if (
          this.attendanceService.isWorkingDayForDate(
            new Date(`${today}T12:00:00Z`),
            shiftConfig,
            shiftConfig.timezone || todayByOrg.get(organizationId),
          )
        ) {
          byUser.set(userId, {
            userId,
            organizationId,
            email: arrangement.user.email,
            firstName: arrangement.user.firstName,
            today,
          });
        }
      }
    }

    if (byUser.size === 0) return [];

    const candidates = [...byUser.values()];
    const todayByCandidate = new Map<string, string>();
    candidates.forEach((c) => todayByCandidate.set(c.userId, c.today));

    const userIds = candidates.map((c) => c.userId);
    const startedLogs: Array<{ user_id: string; date: string }> =
      await this.activityRepo.query(
        `SELECT user_id, date FROM wfh_activity_logs
         WHERE user_id = ANY($1) AND work_started_at IS NOT NULL`,
        [userIds],
      );

    const startedKeys = new Set(
      startedLogs.map((r) => `${r.user_id}|${r.date}`),
    );
    return candidates.filter(
      (c) => !startedKeys.has(`${c.userId}|${c.today}`),
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async remindUnstartedSessions(): Promise<void> {
    try {
      const candidates = await this.findCandidates();
      if (candidates.length === 0) return;

      const orgSettingsCache = new Map<string, OrganizationSettings | null>();
      const getOrgSettings = async (organizationId: string) => {
        if (!orgSettingsCache.has(organizationId)) {
          orgSettingsCache.set(
            organizationId,
            await this.orgSettingsRepo.findOne({ where: { organizationId } }),
          );
        }
        return orgSettingsCache.get(organizationId) ?? null;
      };

      for (const candidate of candidates) {
        // Organization-local business date for this candidate.
        const orgToday = candidate.today;
        const settings = await getOrgSettings(candidate.organizationId);
        const reminderEnabled = settings?.wfhMonitorReminderEnabled ?? true;
        if (!reminderEnabled) continue;

        const intervalMinutes =
          settings?.wfhMonitorReminderIntervalMinutes ?? 30;
        const maxPerDay = settings?.wfhMonitorReminderMaxPerDay ?? null;
        const emailCutoffMinutes =
          settings?.wfhMonitorReminderEmailCutoffMinutes ?? 120;

        let state = await this.reminderStateRepo.findOne({
          where: { user: { id: candidate.userId }, date: orgToday },
        });
        if (!state) {
          state = this.reminderStateRepo.create({
            user: { id: candidate.userId } as any,
            date: orgToday,
            sentCount: 0,
          });
        }

        const now = new Date();
        const dueForSocketReminder =
          (maxPerDay === null || state.sentCount < maxPerDay) &&
          (!state.lastSentAt ||
            now.getTime() - new Date(state.lastSentAt).getTime() >=
              intervalMinutes * 60 * 1000);

        if (dueForSocketReminder) {
          this.messageGateway.emitToUser(candidate.userId, {
            type: 'wfh:monitor_reminder',
            title: 'Start WFH Monitoring',
            message:
              'You have approved WFH today — click Start to begin tracking your session.',
            deepLink: '/user/wfh-monitor',
            sentAt: now.toISOString(),
          });
          state.lastSentAt = now;
          state.sentCount += 1;
        }

        if (!state.emailSentAt && candidate.email) {
          const shiftConfig = await this.attendanceService.resolveShiftConfig(
            candidate.organizationId,
            candidate.userId,
          );
          const elapsedMinutes = this.minutesSinceShiftStart(
            shiftConfig.workStartTime,
          );
          if (elapsedMinutes >= emailCutoffMinutes) {
            await this.mailService
              .sendWfhMonitorReminder(
                {
                  email: candidate.email,
                  firstName: candidate.firstName || 'there',
                },
                candidate.organizationId,
              )
              .catch((err) =>
                this.logger.error(
                  `Failed to send WFH monitor reminder email to ${candidate.email}: ${err?.message}`,
                ),
              );
            state.emailSentAt = now;
          }
        }

        if (dueForSocketReminder || state.emailSentAt) {
          await this.reminderStateRepo.save(state);
        }
      }
    } catch (err) {
      this.logger.error(
        `WFH monitor reminder tick failed: ${err?.message}`,
        err?.stack,
      );
    }
  }

  private minutesSinceShiftStart(workStartTime: string): number {
    if (!workStartTime) return 0;
    const [h, m] = workStartTime.split(':').map(Number);
    const shiftStart = new Date();
    shiftStart.setHours(h || 0, m || 0, 0, 0);
    const diffMs = Date.now() - shiftStart.getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  }
}
