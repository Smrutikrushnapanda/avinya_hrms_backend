import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Message } from './entities/message.entity';
import { MessageRecipient } from './entities/message-recipient.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(MessageRecipient)
    private readonly recipientRepo: Repository<MessageRecipient>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async createMessage(senderUserId: string, dto: CreateMessageDto) {
    if (!senderUserId) {
      throw new BadRequestException('senderUserId is required');
    }
    if (!dto.organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    if (!dto.title?.trim()) {
      throw new BadRequestException('title is required');
    }
    if (!dto.body?.trim()) {
      throw new BadRequestException('body is required');
    }

    const uniqueRecipientIds = Array.from(new Set(dto.recipientUserIds || []))
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean);
    if (uniqueRecipientIds.length === 0) {
      throw new ForbiddenException('At least one recipient is required');
    }

    const message = this.messageRepo.create({
      organizationId: dto.organizationId,
      senderUserId,
      title: dto.title,
      body: dto.body,
      type: dto.type || 'general',
      sentAt: new Date(),
    });
    const savedMessage = await this.messageRepo.save(message);

    const recipients = uniqueRecipientIds.map((recipientUserId) =>
      this.recipientRepo.create({
        messageId: savedMessage.id,
        recipientUserId,
        status: 'UNREAD',
        readAt: null,
      }),
    );
    await this.recipientRepo.save(recipients);

    return {
      message: savedMessage,
      recipientUserIds: uniqueRecipientIds,
    };
  }

  async createMessageToEmployees(
    senderUserId: string,
    organizationId: string,
    employeeIds: string[],
    title: string,
    body: string,
    type?: string,
  ) {
    if (!employeeIds || employeeIds.length === 0) {
      throw new ForbiddenException('At least one employee is required');
    }

    const employees = await this.employeeRepo.find({
      where: { id: In(employeeIds), organizationId },
      select: ['id', 'userId'],
    });
    if (employees.length === 0) {
      throw new NotFoundException('No employees found for provided IDs');
    }

    const recipientUserIds = employees.map((e) => e.userId);

    return this.createMessage(senderUserId, {
      organizationId,
      recipientUserIds,
      title,
      body,
      type,
    });
  }

  async getUserMessages(userId: string, organizationId: string) {
    const rows = await this.recipientRepo.find({
      where: { recipientUserId: userId },
      relations: ['message'],
      order: { createdAt: 'DESC' },
      take: 200,
    });

    return rows
      .filter((row) => row.message?.organizationId === organizationId)
      .map((row) => ({
        id: row.message.id,
        title: row.message.title,
        body: row.message.body,
        type: row.message.type,
        sentAt: row.message.sentAt,
        status: row.status,
        readAt: row.readAt,
        senderUserId: row.message.senderUserId,
      }));
  }

  async markAsRead(userId: string, messageId: string) {
    const recipient = await this.recipientRepo.findOne({
      where: { recipientUserId: userId, messageId },
    });
    if (!recipient) {
      throw new NotFoundException('Message not found for user');
    }

    if (recipient.status === 'READ') {
      return { success: true };
    }

    recipient.status = 'READ';
    recipient.readAt = new Date();
    await this.recipientRepo.save(recipient);
    return { success: true };
  }
}
