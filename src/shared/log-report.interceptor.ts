import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { LogReportService } from '../modules/log-report/log-report.service';

@Injectable()
export class LogReportInterceptor implements NestInterceptor {
  constructor(private readonly logReportService: LogReportService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const method = req.method;
    const path = req.originalUrl || req.url;
    const controllerName = context.getClass().name.replace('Controller', '');

    // Skip logreport endpoints to avoid recursion
    if (path?.startsWith('/logreports')) {
      return next.handle();
    }

    const orgId =
      req.user?.organizationId ||
      req.body?.organizationId ||
      req.query?.organizationId ||
      req.params?.organizationId;

    const userId = req.user?.userId || req.user?.id;
    const userName = req.user?.userName;

    const logPayload = async (statusCode: number, errorMessage?: string) => {
      if (!orgId) return;
      const enabled = await this.logReportService.isEnabled(orgId);
      if (!enabled) return;
      this.logReportService.create({
        organizationId: orgId,
        userId,
        userName,
        actionType: method,
        module: controllerName.toLowerCase(),
        description: errorMessage ? `${method} ${path} failed` : `${method} ${path}`,
        metadata: {
          statusCode,
          path,
          method,
          params: req.params,
          query: req.query,
          errorMessage,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    };

    return next.handle().pipe(
      tap(() => {
        logPayload(res?.statusCode || 200);
      }),
      catchError((err) => {
        const statusCode = err?.status || 500;
        logPayload(statusCode, err?.message);
        return throwError(() => err);
      }),
    );
  }
}
