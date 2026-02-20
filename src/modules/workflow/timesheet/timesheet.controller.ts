import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TimesheetService } from './timesheet.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { ManagerRemarkDto } from './dto/manager-remark.dto';

@ApiTags('Timesheets')
@ApiBearerAuth()
@Controller('timesheets')
export class TimesheetController {
  constructor(private readonly timesheetService: TimesheetService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update daily timesheet entry' })
  @ApiBadRequestResponse({ description: 'Invalid timesheet payload' })
  create(@Body() dto: CreateTimesheetDto) {
    return this.timesheetService.createTimesheet(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List timesheets by organization and employee' })
  @ApiQuery({ name: 'organizationId', required: true, type: String })
  @ApiQuery({ name: 'employeeId', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiOkResponse({ description: 'Timesheets returned successfully' })
  list(
    @Query('organizationId') organizationId: string,
    @Query('employeeId') employeeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.timesheetService.listTimesheets({
      organizationId,
      employeeId,
      fromDate,
      toDate,
      page,
      limit,
    });
  }

  @Patch(':id/remark')
  @ApiOperation({ summary: 'Add or update manager remark for a timesheet' })
  @ApiBadRequestResponse({ description: 'Invalid remark payload' })
  updateRemark(@Param('id') id: string, @Body() dto: ManagerRemarkDto) {
    return this.timesheetService.addManagerRemark(id, dto);
  }
}
