import { Controller, Get, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { MenuItemService } from '../services/menu-item.service';
import { MenuItem } from '../entities/menu-item.entity';

interface JwtPayload {
  userId: string;
  organizationId: string;
}

@Controller('menu-items')
export class MenuItemController {
  constructor(
    private readonly menuItemService: MenuItemService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  async findAll(
    @Query('role') role?: string,
    @Query('planType') planType?: string,
    @Req() req?: Request,
  ): Promise<MenuItem[]> {
    let userId: string | undefined;
    let organizationId: string | undefined;

    const authHeader = req?.headers?.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        try {
          const payload = await this.jwtService.verifyAsync(token);
          userId = payload.userId;
          organizationId = payload.organizationId;
        } catch {
          // token invalid — proceed without user context
        }
      }
    }

    return this.menuItemService.findAll(role, planType, userId, organizationId);
  }
}
