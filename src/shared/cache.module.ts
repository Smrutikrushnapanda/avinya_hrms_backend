import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        // In production (Render), REDIS_URL is set via environment variable.
        // In development, fall back to localhost:6379.
        const redisUrl = process.env.REDIS_URL;

        if (redisUrl) {
          return {
            store: redisStore,
            url: redisUrl,
            ttl: 300, // 5 minutes default TTL
          };
        }

        return {
          store: redisStore,
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          ttl: 300, // 5 minutes default TTL
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class GlobalCacheModule {}
