import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatAttachment } from './entities/chat-attachment.entity';
import { User } from '../auth-core/entities/user.entity';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { MessageGateway } from '../message/message.gateway';
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
    private readonly messageGateway: MessageGateway,
  ) {}

  async getConversations(userId: string) {
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
      { conversation: conv, conversationId: conv.id, user: otherUser, userId: otherUser.id },
    ]);

    return conv;
  }

  async getMessages(conversationId: string, userId: string, limit = 30, before?: string) {
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

    return messages
      .reverse()
      .map((m) => ({
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

    const messageEntity = this.messageRepo.create({
      conversation: { id: conversationId } as any,
      conversationId,
      sender: { id: senderId } as any,
      senderId: senderId,
      text: dto.text?.trim() || undefined,
    });
    const message = await this.messageRepo.save(messageEntity);
    await this.conversationRepo.update(conversationId, { updatedAt: new Date() });

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
    const recipientIds = allParticipants
      .map((p) => p.userId)
      .filter((id) => id !== userId);

    const payloadMessage = {
      ...fullMessage,
      readByAll: this.isReadByAll(fullMessage, allParticipants),
    };

    this.messageGateway.emitChatToUsers(recipientIds, {
      conversationId,
      message: payloadMessage,
    });

    return payloadMessage;
  }

  private isReadByAll(message: ChatMessage | null, participants: ChatParticipant[]) {
    if (!message) return false;
    const others = participants.filter((p) => p.userId !== message.senderId);
    if (!others.length) return false;
    return others.every(
      (p) => p.lastReadAt && p.lastReadAt >= message.createdAt,
    );
  }
}
