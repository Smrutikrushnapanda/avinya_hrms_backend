import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { CreateMessageDto } from './dto/create-message.dto';
import { MarkMessageReadDto } from './dto/mark-read.dto';

@ApiTags('Messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
  ) {}

  @Post()
  async create(@GetUser() user: User, @Body() dto: CreateMessageDto) {
    const senderUserId = (user as any)?.userId || (user as any)?.id;
    const result = await this.messageService.createMessage(senderUserId, dto);
    this.messageGateway.emitToUsers(result.recipientUserIds, {
      message: result.message,
    });
    return result.message;
  }

  @Get('inbox')
  async getInbox(@GetUser() user: User) {
    return this.messageService.getUserMessages(user.id, user.organizationId);
  }

  @Post('read')
  async markRead(@GetUser() user: User, @Body() dto: MarkMessageReadDto) {
    return this.messageService.markAsRead(user.id, dto.messageId);
  }
}
