import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PayrollService } from './payroll.service';
import { CreatePayrollRecordDto, SendPayslipDto, UpdatePayrollRecordDto, UpdatePayrollSettingsDto } from './dto/payroll.dto';

@ApiTags('Payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @ApiOperation({ summary: 'Create payroll record' })
  create(@Body() dto: CreatePayrollRecordDto) {
    return this.payrollService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update payroll record' })
  update(@Param('id') id: string, @Body() dto: UpdatePayrollRecordDto) {
    return this.payrollService.update(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get payroll records with filters' })
  @ApiQuery({ name: 'organizationId', required: true })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'year', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  findAll(@Query() query: any) {
    return this.payrollService.findAll({
      organizationId: query.organizationId,
      month: query.month,
      year: query.year,
      from: query.from,
      to: query.to,
      status: query.status,
      search: query.search,
      employeeId: query.employeeId,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send payslip to employee via email and/or in-app notification' })
  sendPayslip(@Param('id') id: string, @Body() dto: SendPayslipDto) {
    return this.payrollService.sendPayslip(id, dto.method || 'both');
  }

  @Get(':id/slip')
  @ApiOperation({ summary: 'Download salary slip PDF' })
  async downloadSlip(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.payrollService.generateSlipPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=salary-slip-${id}.pdf`);
    return res.send(pdf);
  }

  @Get('notifications/:employeeId')
  @ApiOperation({ summary: 'Get payroll notifications for an employee' })
  getNotifications(@Param('employeeId') employeeId: string) {
    return this.payrollService.getNotifications(employeeId);
  }

  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markNotificationRead(@Param('notificationId') notificationId: string) {
    return this.payrollService.markNotificationRead(notificationId);
  }

  @Get('settings/:orgId')
  @ApiOperation({ summary: 'Get payroll settings' })
  getSettings(@Param('orgId') orgId: string) {
    return this.payrollService.getSettings(orgId);
  }

  @Put('settings/:orgId')
  @ApiOperation({ summary: 'Update payroll settings' })
  updateSettings(@Param('orgId') orgId: string, @Body() dto: UpdatePayrollSettingsDto) {
    return this.payrollService.updateSettings(orgId, dto);
  }
}
