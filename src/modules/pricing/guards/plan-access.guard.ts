import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtPayload } from '../../auth-core/dto/auth.dto';
import { PricingService } from '../pricing.service';
import { PlanType } from '../entities/pricing-plan.entity';
import { REQUIRED_PLAN_TYPES_KEY } from '../decorators/require-plan-types.decorator';

type RequestWithAuth = Request & {
  cookies?: Record<string, string | undefined>;
  user?: JwtPayload;
};

@Injectable()
export class PlanAccessGuard implements CanActivate {
  private readonly planRestrictionsEnabled =
    process.env.ENABLE_PLAN_RESTRICTIONS === 'true';

  constructor(
    private readonly reflector: Reflector,
    private readonly pricingService: PricingService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const requiredPlanTypes = this.reflector.getAllAndOverride<PlanType[]>(
      REQUIRED_PLAN_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlanTypes?.length) {
      return true;
    }

    // For now Basic and Pro Launch share the same product surface. Keep the
    // guard wiring in place so we can turn enforcement back on once billing and
    // payment-gateway based access control is ready.
    if (!this.planRestrictionsEnabled) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(
        'Authentication is required to access this endpoint',
      );
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authentication token',
      );
    }

    const organizationId =
      request.user?.organizationId || payload.organizationId;

    if (!organizationId) {
      throw new UnauthorizedException(
        'Authenticated organization context is missing',
      );
    }

    const plan = await this.pricingService.getOrganizationPlan(organizationId);
    const currentPlanType = plan?.planType ?? null;

    // Older orgs may not yet have a synced subscription row. Avoid blocking
    // them until plan data exists; only enforce when we can positively resolve
    // a restricted plan.
    if (!currentPlanType) {
      return true;
    }

    if (!requiredPlanTypes.includes(currentPlanType)) {
      throw new ForbiddenException({
        code: 'PLAN_RESTRICTED',
        message: `Your ${plan?.name || currentPlanType} plan does not include access to this API. Upgrade to ${this.formatPlanTypes(requiredPlanTypes)} to continue.`,
        currentPlanType,
        requiredPlanTypes,
      });
    }

    return true;
  }

  private extractToken(request: RequestWithAuth): string | null {
    const authorizationHeader = request.headers.authorization;

    if (typeof authorizationHeader === 'string') {
      const [scheme, token] = authorizationHeader.split(' ');

      if (scheme?.toLowerCase() === 'bearer' && token) {
        return token;
      }
    }

    const cookieToken = request.cookies?.token;
    return typeof cookieToken === 'string' && cookieToken.length > 0
      ? cookieToken
      : null;
  }

  private formatPlanTypes(planTypes: PlanType[]): string {
    const labels = planTypes.map((planType) =>
      planType === PlanType.PRO ? 'Pro Launch' : 'Enterprise',
    );

    if (labels.length === 1) {
      return labels[0];
    }

    return `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
  }
}
