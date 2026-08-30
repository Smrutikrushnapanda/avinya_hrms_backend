import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatParticipant } from '../chat/entities/chat-participant.entity';
import { ChatConversation } from '../chat/entities/chat-conversation.entity';

@WebSocketGateway({
  cors: {
    origin: (
      origin: string,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        [
          'https://avinyahrms.duckdns.org',
          'http://avinyahrms.duckdns.org',
          'https://avinya-hrms.vercel.app',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
        ].includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  },
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(ChatParticipant)
    private readonly participantRepo: Repository<ChatParticipant>,
    @InjectRepository(ChatConversation)
    private readonly conversationRepo: Repository<ChatConversation>,
  ) {}

  private socketIndex = new Map<
    string,
    { userId: string; orgId?: string; roles?: string[] }
  >();
  private userConnections = new Map<
    string,
    { count: number; orgId?: string }
  >();

  handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers?.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : '';
      const token = (client.handshake.auth?.token as string) || bearerToken;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET_KEY,
      });

      const userId = payload?.userId;
      const orgId = payload?.organizationId;
      const roles = payload?.roles as string[] | undefined;
      if (!userId) {
        client.disconnect(true);
        return;
      }

      client.join(`user:${userId}`);
      if (orgId) {
        client.join(`org:${orgId}`);
      }
      this.socketIndex.set(client.id, { userId, orgId, roles });
      const existing = this.userConnections.get(userId);
      const nextCount = (existing?.count || 0) + 1;
      this.userConnections.set(userId, { count: nextCount, orgId });

      if (orgId && nextCount === 1) {
        this.server.to(`org:${orgId}`).emit('chat:presence', {
          userId,
          status: 'online',
        });
      }

      if (orgId) {
        const onlineUsers = Array.from(this.userConnections.entries())
          .filter(([, value]) => value.count > 0 && value.orgId === orgId)
          .map(([id]) => id);
        onlineUsers.forEach((id) => {
          client.emit('chat:presence', { userId: id, status: 'online' });
        });
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = this.socketIndex.get(client.id);
    if (data?.userId) {
      const existing = this.userConnections.get(data.userId);
      const nextCount = (existing?.count || 0) - 1;
      if (nextCount <= 0) {
        this.userConnections.delete(data.userId);
        if (data.orgId) {
          this.server.to(`org:${data.orgId}`).emit('chat:presence', {
            userId: data.userId,
            status: 'offline',
          });
        }
      } else {
        this.userConnections.set(data.userId, {
          count: nextCount,
          orgId: existing?.orgId || data.orgId,
        });
      }
    }
    this.socketIndex.delete(client.id);
  }

  @SubscribeMessage('chat:meeting-start')
  async handleMeetingStart(
    client: Socket,
    payload: {
      conversationId: string;
      url: string;
      callerName?: string;
      callerAvatar?: string;
    },
  ) {
    const data = this.socketIndex.get(client.id);
    if (!data?.userId || !data?.orgId) return;
    if (
      typeof payload?.url !== 'string' ||
      !/^https?:\/\//i.test(payload.url)
    ) {
      return;
    }

    const conversation = await this.conversationRepo.findOne({
      where: { id: payload.conversationId },
      select: ['id', 'organizationId'],
    });
    if (!conversation) return;
    if (conversation.organizationId !== data.orgId) {
      const isSuperadmin = data.roles?.includes('SUPERADMIN');
      if (!isSuperadmin) {
        return;
      }
    }

    const participants = await this.participantRepo.find({
      where: { conversationId: payload.conversationId },
      select: ['userId'],
    });
    const participantIds = participants.map((p) => p.userId);

    participantIds.forEach((userId) => {
      if (userId !== data.userId) {
        this.server.to(`user:${userId}`).emit('chat:meeting-start', {
          conversationId: payload.conversationId,
          url: payload.url,
          callerName: payload.callerName || data.userId,
          callerAvatar: payload.callerAvatar || '',
        });
      }
    });
  }

  @SubscribeMessage('chat:meeting-end')
  async handleMeetingEnd(client: Socket, payload: { conversationId: string }) {
    const data = this.socketIndex.get(client.id);
    if (!data?.userId) return;

    const conversation = await this.conversationRepo.findOne({
      where: { id: payload.conversationId },
      select: ['id', 'organizationId'],
    });
    if (!conversation) return;
    if (conversation.organizationId !== data.orgId) {
      const isSuperadmin = data.roles?.includes('SUPERADMIN');
      if (!isSuperadmin) {
        return;
      }
    }

    const participants = await this.participantRepo.find({
      where: { conversationId: payload.conversationId },
      select: ['userId'],
    });
    const participantIds = participants.map((p) => p.userId);

    participantIds.forEach((userId) => {
      if (userId !== data.userId) {
        this.server.to(`user:${userId}`).emit('chat:meeting-end', {
          conversationId: payload.conversationId,
        });
      }
    });
  }

  emitToUsers(userIds: string[], payload: any) {
    userIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit('message:new', payload);
    });
  }

  emitToUser(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('message:new', payload);
  }

  emitChatToUsers(userIds: string[], payload: any) {
    userIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit('chat:message', payload);
    });
  }

  emitChatReadToUsers(userIds: string[], payload: any) {
    userIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit('chat:read', payload);
    });
  }

  // Sent to every socket a single user has open (phone, browser tab, second
  // browser, ...) so their unread badge stays in sync everywhere at once —
  // unlike chat:read, which is about the *other* participant's read tick.
  emitUnreadSyncToUser(userId: string, totalUnread: number) {
    this.server.to(`user:${userId}`).emit('chat:unread-sync', {
      totalUnread,
    });
  }
}
