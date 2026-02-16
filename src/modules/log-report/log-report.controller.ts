import { Body, Controller, Delete, Get, Param, Post, Query, Put } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LogReportService } from './log-report.service';
import { CreateLogReportDto } from './dto/log-report.dto';

@ApiTags('Log Reports')
@Controller('logreports')
export class LogReportController {
  constructor(private readonly logReportService: LogReportService) {}

  @Post()
  @ApiOperation({ summary: 'Create a log report entry' })
  create(@Body() dto: CreateLogReportDto) {
    return this.logReportService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get log report entries with filters' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'actionType', required: false })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query() query: any) {
    return this.logReportService.findAll({
      organizationId: query.organizationId,
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
  @ApiOperation({ summary: 'Delete a log report entry' })
  async delete(@Param('id') id: string) {
    await this.logReportService.delete(id);
    return { message: 'Log deleted successfully' };
  }

  @Get('settings/:orgId')
  @ApiOperation({ summary: 'Get log report settings for organization' })
  async getSettings(@Param('orgId') orgId: string) {
    return this.logReportService.getSettings(orgId);
  }

  @Put('settings/:orgId')
  @ApiOperation({ summary: 'Update log report settings for organization' })
  async updateSettings(
    @Param('orgId') orgId: string,
    @Body() body: { isEnabled: boolean },
  ) {
    return this.logReportService.updateSettings(orgId, body.isEnabled);
  }
}
