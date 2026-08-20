import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Query,
  Request,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
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

  @ApiOperation({ summary: 'Get enhanced platform stats with revenue data' })
  @ApiResponse({
    status: 200,
    description: 'Return enhanced platform statistics',
  })
  @Get('stats/enhanced')
  async getEnhancedStats() {
    return this.superadminService.getEnhancedStats();
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

  @ApiOperation({
    summary: 'Get detailed organization view with subscription history',
  })
  @ApiResponse({ status: 200, description: 'Return org details' })
  @Get('organizations/:id/details')
  async getOrganizationDetails(@Param('id') id: string) {
    return this.superadminService.getOrganizationDetails(id);
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

  @ApiOperation({ summary: 'Get revenue breakdown per organization' })
  @ApiResponse({ status: 200, description: 'Return revenue breakdown' })
  @Get('revenue')
  async getRevenueBreakdown() {
    return this.superadminService.getRevenueBreakdown();
  }

  @ApiOperation({ summary: 'Get subscriptions expiring within N days' })
  @ApiResponse({ status: 200, description: 'Return expiring subscriptions' })
  @Get('expiring-soon')
  async getExpiringSoon(@Query('days') days = 30) {
    return this.superadminService.getExpiringSoon(Number(days));
  }

  @ApiOperation({ summary: 'Send renewal reminder email to an organization' })
  @ApiResponse({ status: 200, description: 'Renewal email sent' })
  @Post('renewal-email')
  async sendRenewalEmail(
    @Body() body: { organizationId: string; customMessage?: string },
    @Request() req: any,
  ) {
    return this.superadminService.sendRenewalEmail({
      organizationId: body.organizationId,
      customMessage: body.customMessage,
      sentBy: req.user?.userId || 'superadmin',
    });
  }

  @ApiOperation({ summary: 'Send bulk renewal emails to expiring orgs' })
  @ApiResponse({ status: 200, description: 'Bulk renewal emails sent' })
  @Post('renewal-email/bulk')
  async sendBulkRenewalEmails(
    @Body() body: { daysThreshold?: number; customMessage?: string },
    @Request() req: any,
  ) {
    return this.superadminService.sendBulkRenewalEmails({
      daysThreshold: body.daysThreshold,
      customMessage: body.customMessage,
      sentBy: req.user?.userId || 'superadmin',
    });
  }

  @ApiOperation({ summary: 'Get renewal email history' })
  @ApiResponse({ status: 200, description: 'Return renewal email logs' })
  @Get('renewal-history')
  async getRenewalEmailHistory(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.superadminService.getRenewalEmailHistory(
      Number(limit),
      Number(offset),
    );
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
