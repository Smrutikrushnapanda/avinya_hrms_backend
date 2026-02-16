import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  private socketIndex = new Map<string, { userId: string; orgId?: string }>();

  handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers?.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const token = (client.handshake.auth?.token as string) || bearerToken;
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET_KEY,
      }) as any;

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
      if (orgId) {
        this.server.to(`org:${orgId}`).emit('chat:presence', {
          userId,
          status: 'online',
        });
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = this.socketIndex.get(client.id);
    if (data?.orgId && data.userId) {
      this.server.to(`org:${data.orgId}`).emit('chat:presence', {
        userId: data.userId,
        status: 'offline',
      });
    }
    this.socketIndex.delete(client.id);
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
}
