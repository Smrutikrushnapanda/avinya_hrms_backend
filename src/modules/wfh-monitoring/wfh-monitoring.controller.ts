import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WfhMonitoringService } from './wfh-monitoring.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../auth-core/dto/auth.dto';

@Controller('wfh-monitoring')
@UseGuards(JwtAuthGuard)
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
  getEmployeeActivity(
    @GetUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Query('date') date?: string,
  ) {
    const allowed = user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
    if (!allowed) throw new ForbiddenException('Access denied');
    return this.service.getEmployeeActivity(userId, date);
  }

  @Get('chart')
  getChartData(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    const allowed = user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
    if (!allowed) throw new ForbiddenException('Access denied');
    return this.service.getChartData(user.organizationId, date);
  }

  @Get('team')
  getTeamActivity(@GetUser() user: JwtPayload, @Query('date') date?: string) {
    const allowed = user.roles?.some(
      (r) => r.roleName === 'ADMIN' || r.roleName === 'MANAGER',
    );
    if (!allowed) throw new ForbiddenException('Access denied');
    return this.service.getTeamActivity(user.organizationId, date);
  }
}
