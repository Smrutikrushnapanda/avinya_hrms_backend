import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from '../auth-core/dto/auth.dto';

export function organizationScope(
  user: JwtPayload,
  requested?: string,
): string {
  if (
    !user.organizationId ||
    (requested && requested !== user.organizationId)
  ) {
    throw new ForbiddenException('You can only access your own organization');
  }
  return user.organizationId;
}
