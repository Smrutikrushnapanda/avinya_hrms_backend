import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  cert,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;

  constructor(private readonly configService: ConfigService) {
    const serviceAccountJson = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set — push notifications are disabled.',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      this.app = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (err) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${(err as Error).message}`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Sends the same notification to a batch of device tokens. Invalid/expired
   * tokens are logged but never thrown — a bad token must not block message
   * delivery or crash the caller (e.g. chat send).
   */
  async sendToTokens(
    tokens: string[],
    payload: PushNotificationPayload,
  ): Promise<void> {
    const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
    if (!this.isEnabled || uniqueTokens.length === 0) return;

    try {
      const response = await getMessaging(this.app!).sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: { channelId: 'default' },
        },
        apns: {
          payload: { aps: { sound: 'default' } },
        },
      });

      if (response.failureCount > 0) {
        response.responses.forEach((r, idx) => {
          if (!r.success) {
            this.logger.warn(
              `Push failed for token ${uniqueTokens[idx]}: ${r.error?.message}`,
            );
          }
        });
      }
    } catch (err) {
      this.logger.error(
        `Push notification send failed: ${(err as Error).message}`,
      );
    }
  }
}
