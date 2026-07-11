import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WfhMonitoringService } from './wfh-monitoring.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { LogAppActivityDto } from './dto/log-app-activity.dto';
import { AcceptTermsDto } from './dto/accept-terms.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';

@Controller('wfh-monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WfhMonitoringController {
  constructor(private readonly service: WfhMonitoringService) {}

  @Post('heartbeat')
  heartbeat(@GetUser() user: JwtPayload, @Body() dto: HeartbeatDto) {
    return this.service.heartbeat(user.userId, user.organizationId, dto);
  }

  @Post('lunch/toggle')
  toggleLunch(@GetUser() user: JwtPayload) {
    return this.service.toggleLunch(user.userId);
  }

  @Post('work/toggle')
  toggleWork(@GetUser() user: JwtPayload) {
    return this.service.toggleWork(user.userId);
  }

  @Get('today')
  getMyToday(@GetUser() user: JwtPayload) {
    return this.service.getMyToday(user.userId);
  }

  @Get('employee/:userId')
  @Roles('ADMIN', 'MANAGER')
  getEmployeeActivity(
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    return this.service.getEmployeeActivity(userId, date);
  }

  @Get('chart')
  @Roles('ADMIN', 'MANAGER')
  getChartData(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    return this.service.getChartData(user.organizationId, date);
  }

  @Get('team')
  @Roles('ADMIN', 'MANAGER')
  getTeamActivity(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    return this.service.getTeamActivity(user.organizationId, date);
  }

  // ─── Desktop app monitoring ──────────────────────────────────────────

  @Post('app-activity')
  @RequireProPlan()
  logAppActivity(@GetUser() user: JwtPayload, @Body() dto: LogAppActivityDto) {
    return this.service.logAppActivity(user.userId, user.organizationId, dto);
  }

  @Post('session/start')
  @RequireProPlan()
  startSession(@GetUser() user: JwtPayload) {
    return this.service.startSession(user.userId);
  }

  @Post('session/end')
  @RequireProPlan()
  endSession(@GetUser() user: JwtPayload) {
    return this.service.endSession(user.userId);
  }

  @Get('app-summary')
  @RequireProPlan()
  getMyAppSummary(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    return this.service.getAppSummary(user.userId, date);
  }

  @Get('employee/:userId/app-summary')
  @RequireProPlan()
  @Roles('ADMIN', 'MANAGER')
  getEmployeeAppSummary(
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    return this.service.getAppSummary(userId, date);
  }

  @Get('team/app-summary')
  @RequireProPlan()
  @Roles('ADMIN', 'MANAGER')
  getTeamAppSummary(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    return this.service.getTeamAppSummary(user.organizationId, date);
  }

  @Get('team/current-activity')
  @RequireProPlan()
  @Roles('ADMIN', 'MANAGER')
  getTeamCurrentActivity(@GetUser() user: JwtPayload) {
    return this.service.getTeamCurrentActivity(user.organizationId);
  }

  @Post('terms-acceptance')
  @RequireProPlan()
  acceptTerms(@GetUser() user: JwtPayload, @Body() dto: AcceptTermsDto) {
    return this.service.acceptTerms(user.userId, dto);
  }

  @Get('terms-acceptance/status')
  @RequireProPlan()
  getTermsStatus(@GetUser() user: JwtPayload) {
    return this.service.getTermsStatus(user.userId);
  }

  @Get('terms-text')
  @RequireProPlan()
  getTermsText() {
    return this.service.getTermsText();
  }
}
