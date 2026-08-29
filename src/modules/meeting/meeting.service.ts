import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThanOrEqual } from 'typeorm';
import { Meeting } from './entities/meeting.entity';
import { CreateMeetingDto, UpdateMeetingDto } from './dto/meeting.dto';
import { User } from '../auth-core/entities/user.entity';
import { MessageService } from '../message/message.service';
import { MessageGateway } from '../message/message.gateway';
import { MailService } from '../mail/mail.service';
import { FirebaseService } from '../firebase/firebase.service';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class MeetingService implements OnModuleInit {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectRepository(Meeting) private meetingRepo: Repository<Meeting>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserPushToken) private pushTokenRepo: Repository<UserPushToken>,
    private messageService: MessageService,
    private messageGateway: MessageGateway,
    private mailService: MailService,
    private firebaseService: FirebaseService,
  ) {}

  onModuleInit() {
    console.log('MeetingService initialized - Scheduled notifications enabled');
  }

  // ─── Notification Dispatch (WebSocket + Push) ───

  private async dispatchMeetingNotifications(
    participantIds: string[],
    meeting: { id: string; title: string; scheduledAt: Date; durationMinutes: number; meetingLink?: string | null; description?: string | null; organizationId: string },
  ): Promise<void> {
    const scheduledTime = new Date(meeting.scheduledAt);
    const timeString = scheduledTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateString = scheduledTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const linkLine = meeting.meetingLink
      ? `\nJoin: ${meeting.meetingLink}`
      : '';

    const title = `Meeting: ${meeting.title}`;
    const body = `Scheduled for ${dateString} at ${timeString}\nDuration: ${meeting.durationMinutes} minutes${linkLine}\n${meeting.description || ''}`;

    // 1. In-app message (DB write)
    const result = await this.messageService.createMessage(participantIds[0], {
      organizationId: meeting.organizationId,
      recipientUserIds: participantIds,
      title,
      body,
      type: 'meeting',
    });

    // 2. WebSocket real-time push
    this.messageGateway.emitToUsers(participantIds, {
      message: result.message,
    });

    // 3. Firebase push notification (mobile + background)
    try {
      const uniqueIds = Array.from(new Set(participantIds));
      const pushTokens = await this.pushTokenRepo.find({
        where: { userId: In(uniqueIds) },
        select: ['token'],
      });
      const tokens = pushTokens.map((t) => t.token);
      if (tokens.length > 0) {
        const { invalidTokens } = await this.firebaseService.sendToTokens(tokens, {
          title,
          body,
          data: {
            type: 'meeting_notification',
            meetingId: meeting.id,
          },
        });
        if (invalidTokens.length) {
          await this.pushTokenRepo.delete({ token: In(invalidTokens) });
        }
      }
    } catch (err) {
      this.logger.warn(`Push notification failed for meeting ${meeting.id}: ${(err as Error).message}`);
    }
  }

  // ─── CRUD Operations ───

  async createMeeting(dto: CreateMeetingDto): Promise<Meeting> {
    const meeting = this.meetingRepo.create({
      title: dto.title,
      description: dto.description,
      scheduledAt: new Date(dto.scheduledAt),
      durationMinutes: dto.durationMinutes || 30,
      organizationId: dto.organizationId,
      createdById: dto.createdById,
      status: 'SCHEDULED',
      notificationSent: false,
    });

    const savedMeeting = await this.meetingRepo.save(meeting);

    // Auto-generate 8x8 Jitsi Meet link using the meeting ID
    const roomId = savedMeeting.id.replace(/-/g, '');
    savedMeeting.meetingLink = `https://meet.jit.si/hrms-${roomId}`;
    await this.meetingRepo.save(savedMeeting);

    // Add participants if provided
    if (dto.participantIds && dto.participantIds.length > 0) {
      const participants = await this.userRepo.findBy({
        id: In(dto.participantIds),
      });
      savedMeeting.participants = participants;
      await this.meetingRepo.save(savedMeeting);
    }

    const fullMeeting = await this.findMeetingById(savedMeeting.id);

    // Send invite email to all participants (fire-and-forget)
    if (fullMeeting.participants?.length) {
      const recipients = fullMeeting.participants
        .filter((p) => p.email)
        .map((p) => ({ email: p.email, firstName: p.firstName }));

      this.mailService
        .sendMeetingInvite(
          recipients,
          {
            title: fullMeeting.title,
            scheduledAt: fullMeeting.scheduledAt,
            durationMinutes: fullMeeting.durationMinutes,
            meetingLink: fullMeeting.meetingLink ?? undefined,
            description: fullMeeting.description,
          },
          fullMeeting.organizationId,
        )
        .catch(() => undefined);
    }

    return fullMeeting;
  }

  async updateMeeting(id: string, dto: UpdateMeetingDto): Promise<Meeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { id },
      relations: ['participants'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Update basic fields
    if (dto.title) meeting.title = dto.title;
    if (dto.description !== undefined) meeting.description = dto.description;
    if (dto.scheduledAt) meeting.scheduledAt = new Date(dto.scheduledAt);
    if (dto.durationMinutes) meeting.durationMinutes = dto.durationMinutes;
    if (dto.status) meeting.status = dto.status;

    // Update participants if provided
    if (dto.participantIds) {
      const participants = await this.userRepo.findBy({
        id: In(dto.participantIds),
      });
      meeting.participants = participants;
      // Reset notification flag if schedule or participants changed
      meeting.notificationSent = false;
    }

    return this.meetingRepo.save(meeting);
  }

  async deleteMeeting(id: string): Promise<void> {
    const meeting = await this.meetingRepo.findOne({
      where: { id },
      relations: ['participants'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    // Send cancellation notification to participants before deleting ONLY if meeting is in the future
    const now = new Date();
    const scheduledTime = new Date(meeting.scheduledAt);

    if (
      meeting.participants &&
      meeting.participants.length > 0 &&
      meeting.status === 'SCHEDULED' &&
      scheduledTime > now
    ) {
      const participantIds = meeting.participants.map((p) => p.id);
      const timeString = scheduledTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const dateString = scheduledTime.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      try {
        await this.messageService.createMessage(meeting.createdById, {
          organizationId: meeting.organizationId,
          recipientUserIds: participantIds,
          title: `Meeting Cancelled: ${meeting.title}`,
          body: `The meeting "${meeting.title}" scheduled for ${dateString} at ${timeString} has been cancelled.`,
          type: 'meeting',
        });
      } catch (error) {
        console.error(
          `[MeetingService] Failed to send cancellation notification for meeting ${id}:`,
          error,
        );
      }

      // Send cancellation email (fire-and-forget)
      const emailRecipients = meeting.participants
        .filter((p) => p.email)
        .map((p) => ({ email: p.email, firstName: p.firstName }));

      if (emailRecipients.length) {
        this.mailService
          .sendMeetingCancellation(
            emailRecipients,
            {
              title: meeting.title,
              scheduledAt: scheduledTime,
              durationMinutes: meeting.durationMinutes,
            },
            meeting.organizationId,
          )
          .catch(() => undefined);
      }
    }

    await this.meetingRepo.delete(id);
  }

  async findMeetingById(id: string): Promise<Meeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { id },
      relations: ['participants', 'organization', 'createdBy'],
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return meeting;
  }

  // ─── Query Methods ───

  async getMeetingsByOrg(organizationId: string): Promise<Meeting[]> {
    return this.meetingRepo.find({
      where: { organizationId },
      relations: ['participants', 'createdBy'],
      order: { scheduledAt: 'DESC' },
    });
  }

  async getUpcomingMeetingsByOrg(organizationId: string): Promise<Meeting[]> {
    const now = new Date();
    return this.meetingRepo.find({
      where: {
        organizationId,
        scheduledAt: MoreThanOrEqual(now),
        status: 'SCHEDULED',
      },
      relations: ['participants', 'createdBy'],
      order: { scheduledAt: 'ASC' },
      take: 10,
    });
  }

  async getMeetingsForUser(userId: string): Promise<Meeting[]> {
    const now = new Date();
    return this.meetingRepo
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      .leftJoinAndSelect('meeting.createdBy', 'createdBy')
      .where('participant.id = :userId', { userId })
      .andWhere('meeting.status = :status', { status: 'SCHEDULED' })
      .orderBy('meeting.scheduledAt', 'ASC')
      .getMany();
  }

  async getUpcomingMeetingsForUser(userId: string): Promise<Meeting[]> {
    const now = new Date();
    return this.meetingRepo
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      .leftJoinAndSelect('meeting.createdBy', 'createdBy')
      .where('participant.id = :userId', { userId })
      .andWhere('meeting.scheduledAt >= :now', { now })
      .andWhere('meeting.status = :status', { status: 'SCHEDULED' })
      .orderBy('meeting.scheduledAt', 'ASC')
      .take(5)
      .getMany();
  }

  // ─── Notification Methods ───

  async sendMeetingNotification(
    meetingId: string,
  ): Promise<{ message: string }> {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
      relations: ['participants', 'organization', 'createdBy'],
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (!meeting.participants || meeting.participants.length === 0) {
      return { message: 'No participants to notify' };
    }

    // Atomically mark as sent BEFORE dispatching — prevents the cron job from
    // also sending at the same time (race condition guard).
    await this.meetingRepo.update(meetingId, { notificationSent: true });

    const participantIds = meeting.participants.map((p) => p.id);

    await this.dispatchMeetingNotifications(participantIds, {
      id: meeting.id,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      durationMinutes: meeting.durationMinutes,
      meetingLink: meeting.meetingLink,
      description: meeting.description,
      organizationId: meeting.organizationId,
    });

    return {
      message: `Notification sent to ${participantIds.length} participants`,
    };
  }

  // ─── Scheduled Task - Run every 5 minutes to check for upcoming meetings ───
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleScheduledNotifications() {
    console.log('[MeetingService] Running scheduled notification check...');

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Find meetings scheduled in the next 5 minutes that haven't had notifications sent
    const upcomingMeetings = await this.meetingRepo
      .createQueryBuilder('meeting')
      .leftJoinAndSelect('meeting.participants', 'participant')
      .leftJoinAndSelect('meeting.organization', 'organization')
      .leftJoinAndSelect('meeting.createdBy', 'createdBy')
      .where('meeting.scheduledAt <= :fiveMinutesFromNow', {
        fiveMinutesFromNow,
      })
      .andWhere('meeting.scheduledAt > :now', { now })
      .andWhere('meeting.status = :status', { status: 'SCHEDULED' })
      .andWhere('meeting.notificationSent = :sent', { sent: false })
      .getMany();

    console.log(
      `[MeetingService] Found ${upcomingMeetings.length} meetings needing notifications`,
    );

    for (const meeting of upcomingMeetings) {
      try {
        if (meeting.participants && meeting.participants.length > 0) {
          // Atomically mark as sent first to prevent race with manual send
          const result = await this.meetingRepo.update(
            { id: meeting.id, notificationSent: false },
            { notificationSent: true },
          );
          if (!result.affected) continue; // another process already sent it

          const participantIds = meeting.participants.map((p) => p.id);

          await this.dispatchMeetingNotifications(participantIds, {
            id: meeting.id,
            title: meeting.title,
            scheduledAt: meeting.scheduledAt,
            durationMinutes: meeting.durationMinutes,
            meetingLink: meeting.meetingLink,
            description: meeting.description,
            organizationId: meeting.organizationId,
          });

          console.log(
            `[MeetingService] Sent notification for meeting: ${meeting.title}`,
          );
        }
      } catch (error) {
        console.error(
          `[MeetingService] Error sending notification for meeting ${meeting.id}:`,
          error,
        );
      }
    }
  }

  // ─── Update Meeting Status (mark as in progress/completed) ───
  async updateMeetingStatus(id: string, status: string): Promise<Meeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { id },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    meeting.status = status;
    return this.meetingRepo.save(meeting);
  }
}
