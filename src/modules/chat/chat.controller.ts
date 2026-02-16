import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { ChatService } from './chat.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Express } from 'express';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get user conversations' })
  async getConversations(@GetUser() user: User) {
    return this.chatService.getConversations(user.id);
  }

  @Post('conversations/direct')
  @ApiOperation({ summary: 'Create or get a direct conversation' })
  async createDirect(
    @GetUser() user: User,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.chatService.createDirectConversation(user, dto);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get conversation messages' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'before', required: false, description: 'ISO date string' })
  async getMessages(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const take = limit ? Number(limit) : 30;
    return this.chatService.getMessages(id, user.id, take, before);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a chat message (text and/or attachments)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'public', 'uploads', 'chat');
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async sendMessage(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendChatMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const senderId = (user as any)?.userId || user.id;
    return this.chatService.sendMessage(id, senderId, dto, files);
  }
}
