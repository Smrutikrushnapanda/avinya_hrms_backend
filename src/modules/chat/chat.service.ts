import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatAttachment } from './entities/chat-attachment.entity';
import { User } from '../auth-core/entities/user.entity';
import { UserPushToken } from '../auth-core/entities/user-push-token.entity';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { MessageGateway } from '../message/message.gateway';
import { FirebaseService } from '../firebase/firebase.service';
import { Express } from 'express';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatParticipant)
    private readonly participantRepo: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatAttachment)
    private readonly attachmentRepo: Repository<ChatAttachment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserPushToken)
    private readonly pushTokenRepo: Repository<UserPushToken>,
    private readonly messageGateway: MessageGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  async getConversations(userId: string) {
    if (!userId) {
      throw new BadRequestException('Invalid authenticated user');
    }

    const participants = await this.participantRepo.find({
      where: { user: { id: userId } },
      relations: ['conversation'],
    });
    const conversationIds = participants.map((p) => p.conversationId);
    if (!conversationIds.length) return [];

    const conversations = await this.conversationRepo.find({
      where: conversationIds.map((id) => ({ id })),
      relations: ['participants', 'participants.user'],
      order: { updatedAt: 'DESC' },
    });

    const participantMap = new Map<string, ChatParticipant>();
    participants.forEach((p) => participantMap.set(p.conversationId, p));

    const results: any[] = [];
    for (const conv of conversations) {
      const lastMessage = await this.messageRepo.findOne({
        where: { conversation: { id: conv.id } },
        relations: ['attachments'],
        order: { createdAt: 'DESC' },
      });

      const me = participantMap.get(conv.id);
      const lastReadAt = me?.lastReadAt;
      const unreadCount = await this.messageRepo
        .createQueryBuilder('m')
        .where('m.conversation_id = :id', { id: conv.id })
        .andWhere('m.sender_id != :uid', { uid: userId })
        .andWhere(lastReadAt ? 'm.created_at > :lastReadAt' : '1=1', {
          lastReadAt,
        })
        .getCount();

      const participantsLight = conv.participants.map((p) => ({
        userId: p.userId,
        firstName: p.user?.firstName || '',
        lastName: p.user?.lastName || '',
      }));

      results.push({
        id: conv.id,
        type: conv.type,
        title: conv.title,
        participants: participantsLight,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              text: lastMessage.text,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
              attachments: lastMessage.attachments || [],
            }
          : null,
        unreadCount,
        updatedAt: conv.updatedAt,
      });
    }
    return results;
  }

  async createDirectConversation(
    currentUser: User,
    dto: CreateDirectConversationDto,
  ) {
    const currentUserId = (currentUser as any)?.userId || currentUser.id;
    if (!currentUserId) {
      throw new BadRequestException('Invalid current user');
    }
    if (dto.userId === currentUserId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    const otherUser = await this.userRepo.findOne({
      where: { id: dto.userId },
    });
    if (!otherUser) throw new NotFoundException('User not found');
    const currentOrgId =
      (currentUser as any)?.organizationId || currentUser.organizationId;
    if (otherUser.organizationId !== currentOrgId) {
      throw new ForbiddenException('User not in your organization');
    }

    const existing = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'p1', 'p1.user_id = :u1', {
        u1: currentUserId,
      })
      .innerJoin('c.participants', 'p2', 'p2.user_id = :u2', {
        u2: dto.userId,
      })
      .where('c.type = :type', { type: 'DIRECT' })
      .getOne();

    if (existing) {
      return existing;
    }

    const conv = await this.conversationRepo.save({
      organizationId: currentOrgId,
      type: 'DIRECT',
    });

    await this.participantRepo.save([
      {
        conversation: conv,
        conversationId: conv.id,
        user: { id: currentUserId } as any,
        userId: currentUserId,
      },
      {
        conversation: conv,
        conversationId: conv.id,
        user: otherUser,
        userId: otherUser.id,
      },
    ]);

    return conv;
  }

  async createGroupConversation(
    currentUser: User,
    dto: CreateGroupConversationDto,
  ) {
    const currentUserId = (currentUser as any)?.userId || currentUser.id;
    const currentOrgId =
      (currentUser as any)?.organizationId || currentUser.organizationId;

    if (!currentUserId) {
      throw new BadRequestException('Invalid current user');
    }

    if (!dto.title?.trim()) {
      throw new BadRequestException('Group title is required');
    }

    const conv = await this.conversationRepo.save({
      organizationId: currentOrgId,
      type: 'GROUP',
      title: dto.title.trim(),
    });

    const allUserIds = [
      currentUserId,
      ...dto.userIds.filter((id) => id !== currentUserId),
    ];

    await this.participantRepo.save(
      allUserIds.map((userId) => ({
        conversation: conv,
        conversationId: conv.id,
        user: { id: userId } as any,
        userId,
        role: userId === currentUserId ? 'admin' : 'member',
      })),
    );

    return conv;
  }

  async getMessages(
    conversationId: string,
    userId: string,
    limit = 30,
    before?: string,
  ) {
    const participant = await this.participantRepo.findOne({
      where: { conversation: { id: conversationId }, user: { id: userId } },
    });
    if (!participant) throw new ForbiddenException('Not a participant');

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.attachments', 'a')
      .leftJoinAndSelect('m.sender', 'sender')
      .where('m.conversationId = :id', { id: conversationId })
      .orderBy('m.createdAt', 'DESC')
      .take(limit);

    if (before) {
      qb.andWhere('m.createdAt < :before', { before: new Date(before) });
    }

    const messages = await qb.getMany();
    const participants = await this.participantRepo.find({
      where: { conversation: { id: conversationId } },
    });

    participant.lastReadAt = new Date();
    await this.participantRepo.save(participant);

    return messages.reverse().map((m) => ({
      ...m,
      readByAll: this.isReadByAll(m, participants),
    }));
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    dto: SendChatMessageDto,
    files: Express.Multer.File[] = [],
  ) {
    const senderId = userId || (dto as any)?.userId;
    if (!senderId) {
      throw new BadRequestException('Invalid sender');
    }
    const participant = await this.participantRepo.findOne({
      where: { conversation: { id: conversationId }, user: { id: senderId } },
      relations: ['conversation'],
    });
    if (!participant) throw new ForbiddenException('Not a participant');

    if (!dto.text && (!files || files.length === 0)) {
      throw new BadRequestException('Message text or attachment is required');
    }

    // Idempotent replay: a retried send (client didn't hear back the first
    // time) carries the same clientMessageId — return the original message
    // instead of creating a duplicate, and don't re-emit/re-push for it.
    if (dto.clientMessageId) {
      const existing = await this.messageRepo.findOne({
        where: { clientMessageId: dto.clientMessageId },
        relations: ['attachments', 'sender'],
      });
      if (existing) {
        const participantsForExisting = await this.participantRepo.find({
          where: { conversation: { id: conversationId } },
        });
        return {
          ...existing,
          readByAll: this.isReadByAll(existing, participantsForExisting),
        };
      }
    }

    const messageEntity = this.messageRepo.create({
      conversation: { id: conversationId } as any,
      conversationId,
      sender: { id: senderId } as any,
      senderId: senderId,
      text: dto.text?.trim() || undefined,
      clientMessageId: dto.clientMessageId || undefined,
    });
    let message: ChatMessage;
    try {
      message = await this.messageRepo.save(messageEntity);
    } catch (err) {
      // Race: two near-simultaneous requests with the same clientMessageId
      // both passed the check above before either insert committed. The
      // unique constraint on client_message_id rejects the second insert —
      // treat that exactly like a normal idempotent replay.
      const isUniqueViolation =
        dto.clientMessageId && (err as { code?: string })?.code === '23505';
      if (!isUniqueViolation) throw err;
      const existing = await this.messageRepo.findOne({
        where: { clientMessageId: dto.clientMessageId },
        relations: ['attachments', 'sender'],
      });
      if (!existing) throw err;
      const participantsForExisting = await this.participantRepo.find({
        where: { conversation: { id: conversationId } },
      });
      return {
        ...existing,
        readByAll: this.isReadByAll(existing, participantsForExisting),
      };
    }
    await this.conversationRepo.update(conversationId, {
      updatedAt: new Date(),
    });

    const attachments: ChatAttachment[] = [];
    if (files?.length) {
      for (const file of files) {
        const isImage = file.mimetype?.startsWith('image/');
        const url = `/static/uploads/chat/${file.filename}`;
        const attachment = this.attachmentRepo.create({
          message: { id: message.id } as any,
          messageId: message.id,
          url,
          fileName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          type: isImage ? 'image' : 'file',
        });
        attachments.push(attachment);
      }
      await this.attachmentRepo.save(attachments);
    }

    participant.lastReadAt = new Date();
    await this.participantRepo.save(participant);

    const fullMessage = await this.messageRepo.findOne({
      where: { id: message.id },
      relations: ['attachments', 'sender'],
    });

    const allParticipants = await this.participantRepo.find({
      where: { conversation: { id: conversationId } },
    });
    const participantIds = Array.from(
      new Set(allParticipants.map((p) => p.userId).filter(Boolean)),
    );

    const payloadMessage = {
      ...fullMessage,
      readByAll: this.isReadByAll(fullMessage, allParticipants),
    };

    this.messageGateway.emitChatToUsers(participantIds, {
      conversationId,
      message: payloadMessage,
    });

    void this.notifyRecipientsUnreadSync(participantIds, senderId);

    void this.sendChatPush(
      conversationId,
      senderId,
      participantIds,
      fullMessage,
    );

    return payloadMessage;
  }

  private async notifyRecipientsUnreadSync(
    participantIds: string[],
    senderId: string,
  ) {
    const recipientIds = participantIds.filter((id) => id !== senderId);
    await Promise.all(
      recipientIds.map(async (userId) => {
        const totalUnread = await this.getTotalUnreadForUser(userId);
        this.messageGateway.emitUnreadSyncToUser(userId, totalUnread);
      }),
    );
  }

  /**
   * Push runs after the socket emit and never throws into the caller — the
   * in-app socket banner (foreground) already delivered the message, so a
   * push failure must not fail the send. This is what puts the notification
   * on the recipient's phone when their app is backgrounded/killed, since the
   * socket disconnects in that state.
   */
  private async sendChatPush(
    conversationId: string,
    senderId: string,
    participantIds: string[],
    message: ChatMessage | null,
  ) {
    try {
      const recipientIds = participantIds.filter((id) => id !== senderId);
      if (!recipientIds.length) return;

      // A recipient may have several active tokens at once (phone + browser,
      // or more than one browser) — push to all of them.
      const recipientTokens = await this.pushTokenRepo.find({
        where: { userId: In(recipientIds) },
        select: ['token'],
      });
      const tokens = recipientTokens.map((r) => r.token);
      if (!tokens.length) return;

      const senderName =
        `${message?.sender?.firstName || ''} ${message?.sender?.lastName || ''}`.trim() ||
        'New message';
      const body = message?.text
        ? message.text
        : message?.attachments?.length
          ? 'Sent an attachment'
          : 'New message';

      const { invalidTokens } = await this.firebaseService.sendToTokens(
        tokens,
        {
          title: senderName,
          body,
          data: {
            type: 'chat_message',
            conversationId,
            senderId,
            senderName,
          },
        },
      );
      if (invalidTokens.length) {
        await this.pushTokenRepo.delete({ token: In(invalidTokens) });
      }
    } catch {
      // never let a push failure affect message delivery
    }
  }

  async markConversationRead(
    conversationId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const participant = await this.participantRepo.findOne({
      where: { conversation: { id: conversationId }, user: { id: userId } },
      relations: ['conversation'],
    });
    if (!participant) throw new ForbiddenException('Not a participant');

    participant.lastReadAt = new Date();
    await this.participantRepo.save(participant);

    const allParticipants = await this.participantRepo.find({
      where: { conversation: { id: conversationId } },
    });
    const participantIds = Array.from(
      new Set(allParticipants.map((p) => p.userId).filter(Boolean)),
    );

    this.messageGateway.emitChatReadToUsers(participantIds, {
      conversationId,
      type: 'read',
      userId,
      readAt: participant.lastReadAt,
    });

    // Reading on one device/tab must clear the badge on all of this user's
    // *own* other devices/tabs too — chat:read above is only ever consumed
    // for the other participant's read-tick, never for the reader's own
    // badge (see message.gateway.ts).
    const totalUnread = await this.getTotalUnreadForUser(userId);
    this.messageGateway.emitUnreadSyncToUser(userId, totalUnread);

    return { success: true };
  }

  /**
   * Total unread message count for a user across every conversation they're
   * in — the single number every client badge (tab bar, sidebar, header)
   * should sync to via the `chat:unread-sync` socket event.
   */
  async getTotalUnreadForUser(userId: string): Promise<number> {
    return this.messageRepo
      .createQueryBuilder('m')
      .innerJoin(
        ChatParticipant,
        'p',
        'p.conversation_id = m.conversation_id AND p.user_id = :userId',
        { userId },
      )
      .where('m.sender_id != :userId', { userId })
      .andWhere('(p.last_read_at IS NULL OR m.created_at > p.last_read_at)')
      .getCount();
  }

  private isReadByAll(
    message: ChatMessage | null,
    participants: ChatParticipant[],
  ) {
    if (!message) return false;
    const others = participants.filter((p) => p.userId !== message.senderId);
    if (!others.length) return false;
    return others.every(
      (p) => p.lastReadAt && p.lastReadAt >= message.createdAt,
    );
  }
}
