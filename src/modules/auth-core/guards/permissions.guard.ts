import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../dto/auth.dto';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user as
      | JwtPayload
      | undefined;

    const hasPermission = user?.permissions?.some((p) =>
      requiredPermissions.includes(p.permissionName),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Requires one of the following permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
