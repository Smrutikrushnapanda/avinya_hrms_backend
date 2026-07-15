import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  private socketIndex = new Map<string, { userId: string; orgId?: string }>();
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
      if (!userId) {
        client.disconnect(true);
        return;
      }

      client.join(`user:${userId}`);
      if (orgId) {
        client.join(`org:${orgId}`);
      }
      this.socketIndex.set(client.id, { userId, orgId });
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
  handleMeetingStart(
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
    client.to(`org:${data.orgId}`).emit('chat:meeting-start', {
      conversationId: payload.conversationId,
      url: payload.url,
      callerName: payload.callerName || data.userId,
      callerAvatar: payload.callerAvatar || '',
    });
  }

  @SubscribeMessage('chat:meeting-end')
  handleMeetingEnd(client: Socket, payload: { conversationId: string }) {
    const data = this.socketIndex.get(client.id);
    if (!data?.orgId) return;
    client.to(`org:${data.orgId}`).emit('chat:meeting-end', {
      conversationId: payload.conversationId,
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
