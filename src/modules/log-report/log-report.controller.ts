import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Put,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LogReportService } from './log-report.service';
import { CreateLogReportDto } from './dto/log-report.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';

@ApiTags('Log Reports')
@RequireProPlan()
@Controller('logreports')
@UseGuards(JwtAuthGuard)
export class LogReportController {
  constructor(private readonly logReportService: LogReportService) {}

  private assertSameOrg(actor: User, organizationId: string) {
    if (
      !(actor as any)?.roles?.some(
        (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
      ) &&
      actor?.organizationId &&
      actor.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'You can only access log reports in your own organization.',
      );
    }
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Create a log report entry' })
  create(@Body() dto: CreateLogReportDto, @GetUser() actor: User) {
    dto.organizationId = actor.organizationId;
    return this.logReportService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get log report entries with filters' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'actionType', required: false })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any, @GetUser() actor: User) {
    return this.logReportService.findAll({
      organizationId: actor.organizationId,
      from: query.from,
      to: query.to,
      userId: query.userId,
      actionType: query.actionType,
      module: query.module,
      search: query.search,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Delete a log report entry' })
  async delete(@Param('id') id: string, @GetUser() actor: User) {
    const report = await this.logReportService.findById(id);
    if (report) {
      this.assertSameOrg(actor, report.organizationId);
    }
    await this.logReportService.delete(id);
    return { message: 'Log deleted successfully' };
  }

  @Get('settings/:orgId')
  @ApiOperation({ summary: 'Get log report settings for organization' })
  async getSettings(@Param('orgId') orgId: string, @GetUser() actor: User) {
    this.assertSameOrg(actor, orgId);
    return this.logReportService.getSettings(orgId);
  }

  @Put('settings/:orgId')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR')
  @ApiOperation({ summary: 'Update log report settings for organization' })
  async updateSettings(
    @Param('orgId') orgId: string,
    @Body() body: { isEnabled: boolean },
    @GetUser() actor: User,
  ) {
    this.assertSameOrg(actor, orgId);
    return this.logReportService.updateSettings(orgId, body.isEnabled);
  }
}
