import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { CacheInterceptor, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { Cache } from 'cache-manager';

@Injectable()
export class OrgAwareCacheInterceptor extends CacheInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) cacheManager: Cache,
    reflector: Reflector,
  ) {
    super(cacheManager, reflector);
  }

  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    if (!request) return undefined;

    const user = request.user;
    const orgId = user?.organizationId || 'no-org';

    const url = this.httpAdapterHost?.httpAdapter?.getRequestUrl(request);
    if (!url) return undefined;

    return `org:${orgId}:${url}`;
  }
}
