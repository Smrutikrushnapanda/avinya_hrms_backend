import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { ChatService } from './chat.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Express, Response } from 'express';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@ApiTags('Chat')
@RequireProPlan()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  private getAuthenticatedUserId(user: Partial<User> & { userId?: string }) {
    const resolvedUserId = user?.userId || user?.id;
    if (!resolvedUserId) {
      throw new BadRequestException('Invalid authenticated user');
    }
    return resolvedUserId;
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Get user conversations' })
  async getConversations(@GetUser() user: User) {
    const userId = this.getAuthenticatedUserId(
      user as Partial<User> & { userId?: string },
    );
    return this.chatService.getConversations(userId);
  }

  @Post('conversations/direct')
  @ApiOperation({ summary: 'Create or get a direct conversation' })
  async createDirect(
    @GetUser() user: User,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.chatService.createDirectConversation(user, dto);
  }

  @Post('conversations/group')
  @ApiOperation({ summary: 'Create a group conversation' })
  async createGroup(
    @GetUser() user: User,
    @Body() dto: CreateGroupConversationDto,
  ) {
    return this.chatService.createGroupConversation(user, dto);
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
    const userId = this.getAuthenticatedUserId(
      user as Partial<User> & { userId?: string },
    );
    return this.chatService.getMessages(id, userId, take, before);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async markConversationRead(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = this.getAuthenticatedUserId(
      user as Partial<User> & { userId?: string },
    );
    return this.chatService.markConversationRead(id, userId);
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
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const unsafe =
          file.mimetype === 'image/svg+xml' ||
          file.mimetype.includes('html') ||
          file.mimetype.includes('javascript') ||
          file.mimetype.includes('xml');
        if (unsafe) {
          return cb(new BadRequestException('File type not allowed'), false);
        }
        const allowed =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/') ||
          file.mimetype.startsWith('audio/') ||
          file.mimetype === 'application/pdf' ||
          [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
          ].includes(file.mimetype);
        if (!allowed) {
          return cb(new BadRequestException('File type not allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async sendMessage(
    @GetUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendChatMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const senderId = this.getAuthenticatedUserId(
      user as Partial<User> & { userId?: string },
    );
    return this.chatService.sendMessage(id, senderId, dto, files);
  }

  @Get('files/:filename')
  @ApiOperation({
    summary:
      'Download a chat file (requires authentication and participant access)',
  })
  @ApiParam({ name: 'filename', type: 'string' })
  async serveChatFile(
    @Param('filename') filename: string,
    @GetUser() user: User,
    @Res() res: Response,
  ) {
    const userId = this.getAuthenticatedUserId(
      user as Partial<User> & { userId?: string },
    );
    const organizationId = (user as any)?.organizationId || user.organizationId;

    const attachment =
      await this.chatService.findAttachmentByFilename(filename);
    if (!attachment) {
      throw new NotFoundException('File not found');
    }

    const conversation = await this.chatService.findConversationByAttachmentId(
      attachment.id,
    );
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isParticipant = await this.chatService.isParticipant(
      conversation.id,
      userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    if (conversation.organizationId !== organizationId) {
      const isSuperadmin = (user as any)?.roles?.some(
        (r: any) => r.roleName === 'SUPERADMIN',
      );
      if (!isSuperadmin) {
        throw new ForbiddenException('Access denied');
      }
    }

    const filePath = join(process.cwd(), 'public', 'uploads', 'chat', filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(filePath);
  }
}
