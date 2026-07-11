import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TimesheetService } from './timesheet.service';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';
import { CreateTimesheetBatchDto } from './dto/create-timesheet-batch.dto';
import { UpdateTimesheetDto } from './dto/update-timesheet.dto';
import { ApproveTimesheetDayDto } from './dto/approve-timesheet-day.dto';
import { JwtAuthGuard } from '../../auth-core/guards/jwt-auth.guard';
import { GetUser } from '../../auth-core/decorators/get-user.decorator';
import { JwtPayload } from '../../auth-core/dto/auth.dto';

function isAdminOrHr(user: JwtPayload): boolean {
  return user.roles.some((r) => r.roleName === 'ADMIN' || r.roleName === 'HR');
}

@ApiTags('Timesheets')
@ApiBearerAuth()
@Controller('timesheets')
@UseGuards(JwtAuthGuard)
export class TimesheetController {
  constructor(private readonly timesheetService: TimesheetService) {}

  @Post()
  @ApiOperation({ summary: 'Create a single timesheet work-log entry' })
  @ApiBadRequestResponse({ description: 'Invalid timesheet payload' })
  create(@Body() dto: CreateTimesheetDto) {
    return this.timesheetService.createTimesheet(dto);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Create multiple timesheet entries for one day in one request' })
  @ApiBadRequestResponse({ description: 'Invalid timesheet payload or overlapping entries' })
  createBatch(@Body() dto: CreateTimesheetBatchDto) {
    return this.timesheetService.createTimesheetBatch(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List timesheets by organization and employee' })
  @ApiQuery({ name: 'organizationId', required: true, type: String })
  @ApiQuery({ name: 'employeeId', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'projectName', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiOkResponse({ description: 'Timesheets returned successfully' })
  list(
    @Query('organizationId') organizationId: string,
    @Query('employeeId') employeeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: string,
    @Query('projectName') projectName?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.timesheetService.listTimesheets({
      organizationId,
      employeeId,
      fromDate,
      toDate,
      status,
      projectName,
      page,
      limit,
    });
  }

  @Get('manager')
  @ApiOperation({ summary: "List direct reports' timesheets for the acting manager" })
  @ApiQuery({ name: 'employeeId', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'projectName', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  async listForManager(
    @GetUser() user: JwtPayload,
    @Query('employeeId') employeeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: string,
    @Query('projectName') projectName?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const managerEmployeeId = await this.timesheetService.resolveEmployeeId(
      user.userId,
      user.organizationId,
    );
    return this.timesheetService.getManagerTimesheets(managerEmployeeId, {
      employeeId,
      fromDate,
      toDate,
      status,
      projectName,
      page,
      limit,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: "Edit one of today's own timesheet entries" })
  async update(
    @GetUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTimesheetDto,
  ) {
    const employeeId = await this.timesheetService.resolveEmployeeId(
      user.userId,
      user.organizationId,
    );
    return this.timesheetService.updateTimesheet(id, employeeId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: "Delete one of today's own timesheet entries" })
  async remove(@GetUser() user: JwtPayload, @Param('id') id: string) {
    const employeeId = await this.timesheetService.resolveEmployeeId(
      user.userId,
      user.organizationId,
    );
    return this.timesheetService.deleteTimesheet(id, employeeId);
  }

  @Post('day-approval')
  @ApiOperation({ summary: "Approve or reject an employee's timesheet for a given day" })
  async approveDay(@GetUser() user: JwtPayload, @Body() dto: ApproveTimesheetDayDto) {
    const actingEmployeeId = await this.timesheetService.resolveEmployeeId(
      user.userId,
      user.organizationId,
    );
    return this.timesheetService.approveDay(actingEmployeeId, isAdminOrHr(user), dto);
  }
}
