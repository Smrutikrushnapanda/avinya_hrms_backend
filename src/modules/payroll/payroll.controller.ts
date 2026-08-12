import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollService } from './payroll.service';
import {
  CreatePayrollRecordDto,
  SendPayslipDto,
  UpdatePayrollRecordDto,
  UpdatePayrollSettingsDto,
  UpsertEmployeeBankDetailDto,
} from './dto/payroll.dto';
import { RequireProPlan } from '../pricing/decorators/require-plan-types.decorator';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { Employee } from '../employee/entities/employee.entity';
import { PayrollRecord } from './entities/payroll-record.entity';

@ApiTags('Payroll')
@RequireProPlan()
@Controller('payroll')
@UseGuards(JwtAuthGuard)
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollRecord)
    private readonly payrollRecordRepo: Repository<PayrollRecord>,
  ) {}

  private actorId(actor: any): string {
    return actor?.userId || actor?.id || '';
  }

  private isPrivileged(actor: any): boolean {
    return !!actor?.roles?.some((r: { roleName: string }) =>
      ['ADMIN', 'HR', 'SUPERADMIN'].includes(r.roleName),
    );
  }

  private async resolveSelfEmployeeId(actor: any): Promise<string | null> {
    const userId = this.actorId(actor);
    if (!userId) return null;
    const employee = await this.employeeRepo.findOne({ where: { userId } });
    return employee?.id ?? null;
  }

  private async assertEmployeeAccess(
    employeeId: string,
    actor: any,
  ): Promise<void> {
    if (this.isPrivileged(actor)) return;
    const selfEmployeeId = await this.resolveSelfEmployeeId(actor);
    if (!selfEmployeeId || selfEmployeeId !== employeeId) {
      throw new ForbiddenException(
        'You can only access your own payroll data.',
      );
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create payroll record' })
  create(@Body() dto: CreatePayrollRecordDto) {
    return this.payrollService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
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
  async findAll(@Query() query: any, @GetUser() actor: any) {
    const organizationId = query.organizationId;
    if (!this.isPrivileged(actor)) {
      if (!actor?.organizationId || actor.organizationId !== organizationId) {
        throw new ForbiddenException(
          'You can only access your own organization payroll data.',
        );
      }
      const selfEmployeeId = await this.resolveSelfEmployeeId(actor);
      if (query.employeeId && query.employeeId !== selfEmployeeId) {
        throw new ForbiddenException(
          'You can only access your own payroll records.',
        );
      }
      query.employeeId = selfEmployeeId || undefined;
    } else if (
      organizationId &&
      actor?.organizationId &&
      !this.isSuperadmin(actor) &&
      actor.organizationId !== organizationId
    ) {
      throw new ForbiddenException(
        'You can only access your own organization payroll data.',
      );
    }

    return this.payrollService.findAll({
      organizationId,
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

  private isSuperadmin(actor: any): boolean {
    return !!actor?.roles?.some(
      (r: { roleName: string }) => r.roleName === 'SUPERADMIN',
    );
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Send payslip to employee via email and/or in-app notification',
  })
  sendPayslip(@Param('id') id: string, @Body() dto: SendPayslipDto) {
    return this.payrollService.sendPayslip(id, dto.method || 'both');
  }

  @Get(':id/slip')
  @ApiOperation({ summary: 'Download salary slip PDF' })
  async downloadSlip(
    @Param('id') id: string,
    @Res() res: Response,
    @GetUser() actor: any,
  ) {
    const record = await this.payrollRecordRepo.findOne({ where: { id } });
    if (record) {
      await this.assertEmployeeAccess(record.employeeId, actor);
    }
    const pdf = await this.payrollService.generateSlipPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=salary-slip-${id}.pdf`,
    );
    return res.send(pdf);
  }

  @Get('notifications/:employeeId')
  @ApiOperation({ summary: 'Get payroll notifications for an employee' })
  async getNotifications(
    @Param('employeeId') employeeId: string,
    @GetUser() actor: any,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.payrollService.getNotifications(employeeId);
  }

  @Patch('notifications/:notificationId/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markNotificationRead(@Param('notificationId') notificationId: string) {
    return this.payrollService.markNotificationRead(notificationId);
  }

  @Get('settings/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Get payroll settings' })
  getSettings(@Param('orgId') orgId: string) {
    return this.payrollService.getSettings(orgId);
  }

  @Put('settings/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update payroll settings' })
  updateSettings(
    @Param('orgId') orgId: string,
    @Body() dto: UpdatePayrollSettingsDto,
  ) {
    return this.payrollService.updateSettings(orgId, dto);
  }

  @Get('bank-details/:employeeId')
  @ApiOperation({ summary: 'Get employee bank/salary account details' })
  async getBankDetail(
    @Param('employeeId') employeeId: string,
    @GetUser() actor: any,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.payrollService.getBankDetail(employeeId);
  }

  @Put('bank-details/:employeeId')
  @ApiOperation({
    summary: 'Create or update employee bank/salary account details',
  })
  async upsertBankDetail(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpsertEmployeeBankDetailDto,
    @GetUser() actor: any,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.payrollService.upsertBankDetail(employeeId, dto);
  }
}
