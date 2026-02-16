import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRecord, PayrollStatus } from './entities/payroll-record.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import { PayrollNotification } from './entities/payroll-notification.entity';
import { CreatePayrollRecordDto, UpdatePayrollRecordDto, UpdatePayrollSettingsDto } from './dto/payroll.dto';
import { Employee } from '../employee/entities/employee.entity';
import { MailService } from './mail.service';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    @InjectRepository(PayrollRecord)
    private readonly payrollRepo: Repository<PayrollRecord>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepo: Repository<PayrollSettings>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollNotification)
    private readonly notificationRepo: Repository<PayrollNotification>,
    private readonly mailService: MailService,
  ) {}

  private computeTotals(values: {
    basic?: number;
    hra?: number;
    conveyance?: number;
    otherAllowances?: number;
    pf?: number;
    tds?: number;
  }) {
    const basic = Number(values.basic || 0);
    const hra = Number(values.hra || 0);
    const conveyance = Number(values.conveyance || 0);
    const otherAllowances = Number(values.otherAllowances || 0);
    const pf = Number(values.pf || 0);
    const tds = Number(values.tds || 0);
    const totalEarnings = basic + hra + conveyance + otherAllowances;
    const totalDeductions = pf + tds;
    const netPay = totalEarnings - totalDeductions;
    return { totalEarnings, totalDeductions, netPay };
  }

  async create(dto: CreatePayrollRecordDto): Promise<PayrollRecord> {
    const totals = this.computeTotals(dto);
    const record = this.payrollRepo.create({
      organizationId: dto.organizationId,
      employeeId: dto.employeeId,
      payPeriod: dto.payPeriod,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      basic: dto.basic,
      hra: dto.hra,
      conveyance: dto.conveyance,
      otherAllowances: dto.otherAllowances,
      pf: dto.pf,
      tds: dto.tds,
      totalEarnings: totals.totalEarnings,
      totalDeductions: totals.totalDeductions,
      netPay: totals.netPay,
      status: (dto.status || 'draft') as PayrollStatus,
    });
    return this.payrollRepo.save(record);
  }

  async update(id: string, dto: UpdatePayrollRecordDto): Promise<PayrollRecord> {
    const record = await this.payrollRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Payroll record not found');

    Object.assign(record, dto);
    const totals = this.computeTotals({
      basic: record.basic,
      hra: record.hra,
      conveyance: record.conveyance,
      otherAllowances: record.otherAllowances,
      pf: record.pf,
      tds: record.tds,
    });
    record.totalEarnings = totals.totalEarnings;
    record.totalDeductions = totals.totalDeductions;
    record.netPay = totals.netPay;

    return this.payrollRepo.save(record);
  }

  async findAll(params: {
    organizationId: string;
    employeeId?: string;
    status?: PayrollStatus | 'all';
    search?: string;
    month?: string;
    year?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      organizationId,
      employeeId,
      status,
      search,
      month,
      year,
      from,
      to,
      page = 1,
      limit = 20,
    } = params;

    const qb = this.payrollRepo
      .createQueryBuilder('payroll')
      .leftJoinAndSelect('payroll.employee', 'employee')
      .where('payroll.organizationId = :organizationId', { organizationId });

    if (employeeId) qb.andWhere('payroll.employeeId = :employeeId', { employeeId });
    if (status && status !== 'all') qb.andWhere('payroll.status = :status', { status });

    if (month && year) {
      const payPeriod = `${year}-${String(month).padStart(2, '0')}`;
      qb.andWhere('payroll.payPeriod = :payPeriod', { payPeriod });
    }

    if (from && to) {
      qb.andWhere('payroll.periodStart >= :fromDate AND payroll.periodEnd <= :toDate', {
        fromDate: new Date(from),
        toDate: new Date(to),
      });
    }

    if (search) {
      qb.andWhere(
        '(employee.firstName ILIKE :search OR employee.lastName ILIKE :search OR employee.employeeCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('payroll.createdAt', 'DESC');

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
  }

  async getSettings(organizationId: string): Promise<PayrollSettings> {
    let settings = await this.settingsRepo.findOne({ where: { organizationId } });
    if (!settings) {
      settings = this.settingsRepo.create({ organizationId });
      settings = await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async updateSettings(organizationId: string, dto: UpdatePayrollSettingsDto): Promise<PayrollSettings> {
    let settings = await this.settingsRepo.findOne({ where: { organizationId } });
    if (!settings) {
      settings = this.settingsRepo.create({ organizationId, ...dto });
    } else {
      Object.assign(settings, dto);
    }
    return this.settingsRepo.save(settings);
  }

  async generateSlipPdf(id: string): Promise<Buffer> {
    const record = await this.payrollRepo.findOne({
      where: { id },
    });
    if (!record) throw new NotFoundException('Payroll record not found');

    const settings = await this.getSettings(record.organizationId);

    const employee = await this.employeeRepo.findOne({
      where: { id: record.employeeId },
      relations: ['department'],
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const color = settings.primaryColor || '#1e40af';
    const periodStart = new Date(record.periodStart as any);
    const periodEnd = new Date(record.periodEnd as any);
    const fmt = (n: number) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const html = `
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; padding: 0; margin: 0; background: #ffffff; -webkit-print-color-adjust: exact; }

            .page { padding: 40px 48px; }

            /* Header banner */
            .header-banner {
              background: linear-gradient(135deg, ${color}, ${color}dd);
              border-radius: 16px;
              padding: 28px 32px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              color: #ffffff;
              margin-bottom: 28px;
            }
            .header-banner .logo-area { display: flex; align-items: center; gap: 16px; }
            .header-banner .logo-area img { height: 56px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.15); padding: 4px; }
            .header-banner .company-name { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
            .header-banner .company-address { font-size: 11px; opacity: 0.85; margin-top: 2px; max-width: 280px; line-height: 1.4; }
            .header-right { text-align: right; }
            .header-right .slip-title { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
            .header-right .slip-period { font-size: 13px; opacity: 0.85; margin-top: 4px; }
            .badge {
              display: inline-block;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
              padding: 4px 14px;
              border-radius: 999px;
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.35);
              margin-top: 8px;
            }

            /* Employee info */
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
              margin-bottom: 28px;
            }
            .info-card {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 18px 20px;
              background: #f8fafc;
            }
            .info-card-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: ${color};
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 2px solid ${color}20;
            }
            .info-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
            .info-label { color: #64748b; font-weight: 500; }
            .info-value { font-weight: 600; color: #1e293b; }

            /* Earnings & Deductions */
            .section-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: ${color};
              margin-bottom: 12px;
            }
            .table-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 24px;
            }
            .table-card {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              overflow: hidden;
            }
            .table-card table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .table-card th {
              background: #f1f5f9;
              padding: 10px 16px;
              text-align: left;
              font-weight: 700;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #475569;
              border-bottom: 1px solid #e2e8f0;
            }
            .table-card th:last-child { text-align: right; }
            .table-card td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
            .table-card td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
            .table-card tr:last-child td { border-bottom: none; }
            .table-card .total-row { background: #f8fafc; }
            .table-card .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #e2e8f0; }
            .earnings-total td { color: #16a34a; }
            .deductions-total td { color: #dc2626; }

            /* Net Pay banner */
            .net-pay-banner {
              background: linear-gradient(135deg, ${color}08, ${color}15);
              border: 2px solid ${color}30;
              border-radius: 14px;
              padding: 22px 28px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 24px;
            }
            .net-pay-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: ${color};
            }
            .net-pay-sublabel { font-size: 11px; color: #64748b; margin-top: 2px; }
            .net-pay-amount {
              font-size: 32px;
              font-weight: 800;
              color: ${color};
              letter-spacing: -1px;
              font-variant-numeric: tabular-nums;
            }
            .net-pay-currency { font-size: 18px; font-weight: 600; }

            /* Summary cards */
            .summary-strip {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 12px;
              margin-bottom: 28px;
            }
            .summary-item {
              text-align: center;
              padding: 14px;
              border-radius: 10px;
              border: 1px solid #e2e8f0;
            }
            .summary-item.earnings { background: #f0fdf4; border-color: #bbf7d0; }
            .summary-item.deductions { background: #fef2f2; border-color: #fecaca; }
            .summary-item.net { background: ${color}08; border-color: ${color}30; }
            .summary-item-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; }
            .summary-item-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
            .summary-item.earnings .summary-item-value { color: #16a34a; }
            .summary-item.deductions .summary-item-value { color: #dc2626; }
            .summary-item.net .summary-item-value { color: ${color}; }

            /* Footer */
            .footer {
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .footer-note { font-size: 10px; color: #94a3b8; line-height: 1.5; max-width: 360px; }
            .footer-meta { font-size: 10px; color: #94a3b8; text-align: right; }
            .footer-disclaimer {
              font-size: 9px;
              color: #94a3b8;
              text-align: center;
              margin-top: 12px;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <!-- Header Banner -->
            <div class="header-banner">
              <div class="logo-area">
                ${settings.logoUrl ? `<img src="${settings.logoUrl}" alt="logo"/>` : ''}
                <div>
                  <div class="company-name">${settings.companyName || 'Company'}</div>
                  ${settings.address ? `<div class="company-address">${settings.address}</div>` : ''}
                </div>
              </div>
              <div class="header-right">
                <div class="slip-title">Salary Slip</div>
                <div class="slip-period">${fmtDate(periodStart)} - ${fmtDate(periodEnd)}</div>
                <div class="badge">${record.status.toUpperCase()}</div>
              </div>
            </div>

            <!-- Employee & Pay Info -->
            <div class="info-grid">
              <div class="info-card">
                <div class="info-card-title">Employee Details</div>
                <div class="info-row"><span class="info-label">Name</span><span class="info-value">${employee.firstName} ${employee.lastName || ''}</span></div>
                <div class="info-row"><span class="info-label">Employee Code</span><span class="info-value">${employee.employeeCode || '-'}</span></div>
                <div class="info-row"><span class="info-label">Department</span><span class="info-value">${employee.department?.name || '-'}</span></div>
                <div class="info-row"><span class="info-label">Email</span><span class="info-value">${employee.workEmail || '-'}</span></div>
              </div>
              <div class="info-card">
                <div class="info-card-title">Pay Information</div>
                <div class="info-row"><span class="info-label">Pay Period</span><span class="info-value">${record.payPeriod}</span></div>
                <div class="info-row"><span class="info-label">Period Start</span><span class="info-value">${fmtDate(periodStart)}</span></div>
                <div class="info-row"><span class="info-label">Period End</span><span class="info-value">${fmtDate(periodEnd)}</span></div>
                <div class="info-row"><span class="info-label">Generated On</span><span class="info-value">${fmtDate(new Date())}</span></div>
              </div>
            </div>

            <!-- Earnings & Deductions Tables -->
            <div class="table-grid">
              <div class="table-card">
                <table>
                  <thead><tr><th>Earnings</th><th>Amount (&#8377;)</th></tr></thead>
                  <tbody>
                    <tr><td>Basic Salary</td><td>${fmt(record.basic)}</td></tr>
                    <tr><td>House Rent Allowance</td><td>${fmt(record.hra)}</td></tr>
                    <tr><td>Conveyance Allowance</td><td>${fmt(record.conveyance)}</td></tr>
                    <tr><td>Other Allowances</td><td>${fmt(record.otherAllowances)}</td></tr>
                    <tr class="total-row earnings-total"><td>Total Earnings</td><td>${fmt(record.totalEarnings)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="table-card">
                <table>
                  <thead><tr><th>Deductions</th><th>Amount (&#8377;)</th></tr></thead>
                  <tbody>
                    <tr><td>Provident Fund (PF)</td><td>${fmt(record.pf)}</td></tr>
                    <tr><td>Tax Deducted at Source (TDS)</td><td>${fmt(record.tds)}</td></tr>
                    <tr><td></td><td></td></tr>
                    <tr><td></td><td></td></tr>
                    <tr class="total-row deductions-total"><td>Total Deductions</td><td>${fmt(record.totalDeductions)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Summary Strip -->
            <div class="summary-strip">
              <div class="summary-item earnings">
                <div class="summary-item-label">Total Earnings</div>
                <div class="summary-item-value">&#8377; ${fmt(record.totalEarnings)}</div>
              </div>
              <div class="summary-item deductions">
                <div class="summary-item-label">Total Deductions</div>
                <div class="summary-item-value">&#8377; ${fmt(record.totalDeductions)}</div>
              </div>
              <div class="summary-item net">
                <div class="summary-item-label">Net Pay</div>
                <div class="summary-item-value">&#8377; ${fmt(record.netPay)}</div>
              </div>
            </div>

            <!-- Net Pay Banner -->
            <div class="net-pay-banner">
              <div>
                <div class="net-pay-label">Net Payable Amount</div>
                <div class="net-pay-sublabel">Total Earnings minus Total Deductions</div>
              </div>
              <div class="net-pay-amount"><span class="net-pay-currency">&#8377;</span> ${fmt(record.netPay)}</div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <div class="footer-note">
                ${settings.footerNote || 'This is a computer-generated document and does not require a signature.'}
              </div>
              <div class="footer-meta">
                <div>${settings.companyName || 'Company'}</div>
                <div>Generated: ${fmtDate(new Date())}</div>
              </div>
            </div>
            <div class="footer-disclaimer">This is a system-generated salary slip. For any discrepancies, please contact your HR department.</div>
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    return Buffer.from(pdf);
  }

  async sendPayslip(id: string, method: 'email' | 'in_app' | 'both' = 'both') {
    const record = await this.payrollRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Payroll record not found');

    const employee = await this.employeeRepo.findOne({
      where: { id: record.employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const settings = await this.getSettings(record.organizationId);
    const fmt = (n: number) =>
      Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

    let emailSent = false;

    // Send email
    if (method === 'email' || method === 'both') {
      const email = employee.workEmail || employee.personalEmail;
      if (email) {
        const pdfBuffer = await this.generateSlipPdf(id);
        emailSent = await this.mailService.sendPayslipEmail({
          to: email,
          employeeName: `${employee.firstName} ${employee.lastName || ''}`.trim(),
          payPeriod: record.payPeriod,
          netPay: fmt(record.netPay),
          pdfBuffer,
          companyName: settings.companyName,
        });
      } else {
        this.logger.warn(`No email found for employee ${employee.id}`);
      }
    }

    // Create in-app notification
    if (method === 'in_app' || method === 'both') {
      const notification = this.notificationRepo.create({
        employeeId: employee.id,
        payrollRecordId: record.id,
        title: `Salary Slip - ${record.payPeriod}`,
        message: `Your salary slip for ${record.payPeriod} is ready. Net pay: ${fmt(record.netPay)}`,
        sentVia: method,
        emailSent,
      });
      await this.notificationRepo.save(notification);
    }

    // Update status to paid
    record.status = 'paid';
    await this.payrollRepo.save(record);

    return {
      success: true,
      emailSent,
      inAppNotification: method === 'in_app' || method === 'both',
      message: this.buildResultMessage(method, emailSent),
    };
  }

  private buildResultMessage(method: string, emailSent: boolean): string {
    if (method === 'email') {
      return emailSent ? 'Payslip sent via email' : 'Email sending failed - check SendGrid configuration';
    }
    if (method === 'in_app') {
      return 'Payslip notification sent to employee app';
    }
    // both
    const parts: string[] = [];
    parts.push(emailSent ? 'Email sent' : 'Email failed');
    parts.push('In-app notification created');
    return parts.join('. ');
  }

  async getNotifications(employeeId: string) {
    return this.notificationRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markNotificationRead(notificationId: string) {
    const notification = await this.notificationRepo.findOne({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }
}
