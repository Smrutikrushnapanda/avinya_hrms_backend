import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { MenuItemService } from '../services/menu-item.service';
import { MenuItem } from '../entities/menu-item.entity';
import { CreateMenuItemDto, UpdateMenuItemDto } from '../dto/menu-item.dto';
import { JwtAuthGuard } from '../../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth-core/guards/roles.guard';
import { Roles } from '../../auth-core/decorators/roles.decorator';

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

  // Intentionally unauthenticated-tolerant: soft-decodes the JWT if present
  // (to personalize role/plan/condition filtering) but falls back to an
  // unauthenticated response instead of rejecting. Do not add @UseGuards here.
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

  // Unfiltered tree (incl. inactive items) for the super admin menu editor.
  // Menu items are global/platform-wide (no organizationId column), so only
  // the super admin — not individual org admins — may configure them.
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  findAllForAdmin(): Promise<MenuItem[]> {
    return this.menuItemService.findAllForAdmin();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  create(@Body() dto: CreateMenuItemDto): Promise<MenuItem> {
    return this.menuItemService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItem> {
    return this.menuItemService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  remove(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.menuItemService.remove(id);
  }
}
