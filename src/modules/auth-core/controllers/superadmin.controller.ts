import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { SuperadminService } from '../services/superadmin.service';

@ApiTags('Superadmin')
@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @ApiOperation({ summary: 'Get overall platform metrics' })
  @ApiResponse({ status: 200, description: 'Return platforms statistics' })
  @Get('stats')
  async getStats() {
    return this.superadminService.getStats();
  }

  @ApiOperation({ summary: 'Get all organizations with details' })
  @ApiResponse({
    status: 200,
    description: 'Return all customers (organizations)',
  })
  @Get('organizations')
  async getOrganizations() {
    return this.superadminService.getOrganizations();
  }

  @ApiOperation({ summary: 'Get all subscriptions' })
  @ApiResponse({
    status: 200,
    description: 'Return all platform subscriptions',
  })
  @Get('subscriptions')
  async getSubscriptions() {
    return this.superadminService.getSubscriptions();
  }

  @ApiOperation({ summary: 'Get global system activity logs' })
  @ApiResponse({
    status: 200,
    description: 'Return user login/logout activities',
  })
  @Get('logs')
  async getLogs(@Query('limit') limit = 100, @Query('offset') offset = 0) {
    return this.superadminService.getSystemLogs(Number(limit), Number(offset));
  }

  @ApiOperation({ summary: 'Block an organization (suspend all access)' })
  @ApiResponse({ status: 200, description: 'Organization blocked' })
  @Patch('organizations/:id/block')
  async blockOrganization(@Param('id') id: string, @Request() req: any) {
    return this.superadminService.blockOrganization(
      id,
      req.user?.userId || 'superadmin',
    );
  }

  @ApiOperation({ summary: 'Unblock a previously blocked organization' })
  @ApiResponse({ status: 200, description: 'Organization unblocked' })
  @Patch('organizations/:id/unblock')
  async unblockOrganization(@Param('id') id: string, @Request() req: any) {
    return this.superadminService.unblockOrganization(
      id,
      req.user?.userId || 'superadmin',
    );
  }
}
