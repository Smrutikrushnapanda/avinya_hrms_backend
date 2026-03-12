import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRecord, PayrollStatus } from './entities/payroll-record.entity';
import { PayrollSettings } from './entities/payroll-settings.entity';
import { PayrollNotification } from './entities/payroll-notification.entity';
import { CreatePayrollRecordDto, UpdatePayrollRecordDto, UpdatePayrollSettingsDto } from './dto/payroll.dto';
import { Employee } from '../employee/entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { MailService } from './mail.service';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  private readonly defaultFontStack = `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

  private toWords(num: number): string {
    const n = Math.floor(Math.abs(Number(num || 0)));
    if (n === 0) return 'Zero';

    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const twoDigit = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`);
    const threeDigit = (x: number) => {
      const h = Math.floor(x / 100);
      const r = x % 100;
      const hPart = h ? `${ones[h]} Hundred` : '';
      const rPart = r ? twoDigit(r) : '';
      return [hPart, rPart].filter(Boolean).join(' ');
    };

    let x = n;
    const parts: string[] = [];
    const crore = Math.floor(x / 10000000);
    x %= 10000000;
    const lakh = Math.floor(x / 100000);
    x %= 100000;
    const thousand = Math.floor(x / 1000);
    x %= 1000;
    const rest = x;

    if (crore) parts.push(`${threeDigit(crore)} Crore`);
    if (lakh) parts.push(`${threeDigit(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigit(thousand)} Thousand`);
    if (rest) parts.push(threeDigit(rest));

    return parts.join(' ').trim();
  }

  constructor(
    @InjectRepository(PayrollRecord)
    private readonly payrollRepo: Repository<PayrollRecord>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepo: Repository<PayrollSettings>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollNotification)
    private readonly notificationRepo: Repository<PayrollNotification>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
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

    // Fetch organization data and merge with settings
    const organization = await this.organizationRepo.findOne({ where: { id: organizationId } });
    if (organization) {
      // Use organization data if settings don't have custom values
      settings.companyName = settings.companyName || organization.organizationName;
      settings.logoUrl = settings.logoUrl || organization.logoUrl;
      settings.address = settings.address || organization.address;
    }

    if (!Array.isArray(settings.customFields)) {
      settings.customFields = [];
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
    settings.customFields = Array.isArray(dto.customFields)
      ? dto.customFields
          .filter((field) => field?.label?.trim())
          .map((field) => ({
            label: field.label.trim(),
            value: field.value?.trim() || '',
          }))
      : settings.customFields || [];
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
      relations: ['department', 'designation'],
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const color = settings.primaryColor || '#2f3640';
    const periodStart = new Date(record.periodStart as any);
    const periodEnd = new Date(record.periodEnd as any);
    const fmt = (n: number) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const totalWorkingDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1);
    const actualPayableDays = totalWorkingDays;
    const lossOfPayDays = 0;
    const payableDays = actualPayableDays - lossOfPayDays;
    const netWords = `${this.toWords(Number(record.netPay))} only`;
    const headerPeriod = periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();

    const html = `
      <html>
        <head>
          <style>
            @page { size: A4; margin: 10mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: ${this.defaultFontStack}; color: #0f172a; background: #ffffff; font-size: 11px; -webkit-print-color-adjust: exact; }
            .page { min-height: 276mm; border: 1px solid #d7dde8; border-radius: 10px; overflow: hidden; }
            .top-accent { height: 5px; background: ${color}; }
            .header {
              padding: 16px 18px;
              background: #ffffff;
              border-bottom: 1px solid #e2e8f0;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
            }
            .brand { display: flex; align-items: center; gap: 10px; }
            .logo-box {
              width: 54px;
              height: 54px;
              border-radius: 12px;
              border: 1px solid ${color}55;
              background: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              font-weight: 800;
              color: ${color};
              box-shadow: 0 3px 8px rgba(15, 23, 42, 0.08);
            }
            .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
            .company-name { font-size: 15px; font-weight: 800; color: #0f172a; }
            .company-address { margin-top: 2px; color: #64748b; font-size: 10px; max-width: 380px; line-height: 1.4; }
            .slip-title { text-align: right; }
            .slip-title .label { font-size: 10px; color: ${color}; letter-spacing: 0.8px; font-weight: 800; text-transform: uppercase; }
            .slip-title .value { font-size: 20px; font-weight: 800; margin-top: 2px; color: #0f172a; }
            .slip-title .period { margin-top: 2px; font-size: 11px; color: #64748b; }
            .content { padding: 14px 18px 12px; }
            .employee-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 10px;
            }
            .employee-name { font-size: 17px; font-weight: 700; }
            .status-badge {
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.8px;
              text-transform: uppercase;
              padding: 4px 8px;
              border-radius: 999px;
              border: 1px solid ${color}33;
              color: ${color};
              background: ${color}12;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              overflow: hidden;
              margin-bottom: 10px;
            }
            .meta-item {
              padding: 8px 10px;
              border-right: 1px solid #e2e8f0;
              border-bottom: 1px solid #e2e8f0;
              min-height: 48px;
            }
            .meta-item:nth-child(4n) { border-right: none; }
            .meta-item:nth-last-child(-n + 4) { border-bottom: none; }
            .meta-k { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
            .meta-v { margin-top: 3px; font-size: 11px; font-weight: 600; color: #0f172a; }
            .section-title {
              margin-top: 8px;
              margin-bottom: 6px;
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.7px;
              color: ${color};
            }
            .days-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 8px;
              margin-bottom: 10px;
            }
            .day-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 8px 9px;
              background: #f8fafc;
            }
            .day-k { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
            .day-v { margin-top: 4px; font-size: 13px; font-weight: 700; color: #0f172a; }
            .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .table-wrap { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
            table.amounts { width: 100%; border-collapse: collapse; font-size: 11px; }
            table.amounts thead th {
              text-align: left;
              background: ${color}10;
              border-bottom: 1px solid #e2e8f0;
              padding: 7px 8px;
              font-size: 9px;
              letter-spacing: 0.5px;
              text-transform: uppercase;
              color: ${color};
            }
            table.amounts thead th:last-child, table.amounts tbody td:last-child { text-align: right; }
            table.amounts tbody td {
              padding: 7px 8px;
              border-bottom: 1px solid #eef2f7;
            }
            table.amounts tbody tr:last-child td { border-bottom: none; }
            table.amounts tbody tr.total td {
              font-weight: 800;
              background: #f8fafc;
              border-top: 1px solid #dbe5f0;
            }
            .summary {
              margin-top: 10px;
              border: 1px solid #dbe5f0;
              border-radius: 8px;
              overflow: hidden;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 9px 10px;
              border-bottom: 1px solid #e7edf5;
            }
            .summary-row:last-child { border-bottom: none; }
            .summary-row.net { background: ${color}10; font-size: 13px; font-weight: 800; }
            .summary-row.words { font-size: 10px; color: #334155; align-items: flex-start; gap: 16px; }
            .summary-row.words span:last-child { text-align: right; font-weight: 700; color: #0f172a; }
            .footer-note {
              margin-top: 8px;
              font-size: 9.5px;
              color: #64748b;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="top-accent"></div>
            <div class="header">
              <div class="brand">
                <div class="logo-box">
                  ${settings.logoUrl
                    ? `<img src="${settings.logoUrl}" alt="logo" />`
                    : (settings.companyName || 'C').trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="company-name">${settings.companyName || 'Company'}</div>
                  <div class="company-address">${settings.address || '-'}</div>
                </div>
              </div>
              <div class="slip-title">
                <div class="label">PROVISIONAL PAYSLIP</div>
                <div class="value">${headerPeriod}</div>
                <div class="period">${fmtDate(periodStart)} - ${fmtDate(periodEnd)}</div>
              </div>
            </div>

            <div class="content">
              <div class="employee-row">
                <div class="employee-name">${`${employee.firstName} ${employee.lastName || ''}`.trim()}</div>
                <div class="status-badge">${record.status}</div>
              </div>

              <div class="meta-grid">
                <div class="meta-item"><div class="meta-k">Employee Number</div><div class="meta-v">${employee.employeeCode || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">Date Joined</div><div class="meta-v">${employee.dateOfJoining ? fmtDate(new Date(employee.dateOfJoining as any)) : '-'}</div></div>
                <div class="meta-item"><div class="meta-k">Department</div><div class="meta-v">${employee.department?.name || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">Designation</div><div class="meta-v">${employee.designation?.name || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">PAN</div><div class="meta-v">${settings.panNumber || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">UAN / PF No</div><div class="meta-v">${settings.pfRegistrationNumber || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">Work Email</div><div class="meta-v">${employee.workEmail || '-'}</div></div>
                <div class="meta-item"><div class="meta-k">Pay Period</div><div class="meta-v">${record.payPeriod}</div></div>
              </div>

              <div class="section-title">SALARY DETAILS</div>
              <div class="days-grid">
                <div class="day-card"><div class="day-k">Actual Payable Days</div><div class="day-v">${actualPayableDays.toFixed(1)}</div></div>
                <div class="day-card"><div class="day-k">Total Working Days</div><div class="day-v">${totalWorkingDays.toFixed(1)}</div></div>
                <div class="day-card"><div class="day-k">Loss Of Pay Days</div><div class="day-v">${lossOfPayDays.toFixed(1)}</div></div>
                <div class="day-card"><div class="day-k">Days Payable</div><div class="day-v">${payableDays}</div></div>
              </div>

              <div class="split">
                <div class="table-wrap">
                  <table class="amounts">
                    <thead><tr><th>Earnings</th><th>Amount (INR)</th></tr></thead>
                    <tbody>
                      <tr><td>Basic</td><td>${fmt(record.basic)}</td></tr>
                      <tr><td>House Rent Allowance (HRA)</td><td>${fmt(record.hra)}</td></tr>
                      <tr><td>Conveyance Allowance</td><td>${fmt(record.conveyance)}</td></tr>
                      <tr><td>Other Allowances</td><td>${fmt(record.otherAllowances)}</td></tr>
                      <tr class="total"><td>Total Earnings (A)</td><td>${fmt(record.totalEarnings)}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div class="table-wrap">
                  <table class="amounts">
                    <thead><tr><th>Deductions</th><th>Amount (INR)</th></tr></thead>
                    <tbody>
                      <tr><td>Provident Fund (PF)</td><td>${fmt(record.pf)}</td></tr>
                      <tr><td>Tax Deducted at Source (TDS)</td><td>${fmt(record.tds)}</td></tr>
                      <tr><td>-</td><td>-</td></tr>
                      <tr><td>-</td><td>-</td></tr>
                      <tr class="total"><td>Total Deductions (B)</td><td>${fmt(record.totalDeductions)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="summary">
                <div class="summary-row net">
                  <span>Net Salary Payable (A - B)</span>
                  <span>${fmt(record.netPay)}</span>
                </div>
                <div class="summary-row words">
                  <span>Net Salary in words</span>
                  <span>${netWords}</span>
                </div>
              </div>

              <div class="footer-note">
                <span>Note: All amounts displayed in this payslip are in INR.</span>
                <span>${settings.footerNote || 'System-generated payslip.'}</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } catch (error) {
      this.logger.error(`Failed to generate salary slip PDF for payroll ${id}`, error);
      throw error;
    } finally {
      if (browser) await browser.close();
    }
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
    let inAppNotification = false;

    // Send email
    if (method === 'email' || method === 'both') {
      const email = employee.workEmail || employee.personalEmail;
      if (email) {
        try {
          const pdfBuffer = await this.generateSlipPdf(id);
          emailSent = await this.mailService.sendPayslipEmail({
            to: email,
            employeeName: `${employee.firstName} ${employee.lastName || ''}`.trim(),
            payPeriod: record.payPeriod,
            netPay: fmt(record.netPay),
            pdfBuffer,
            companyName: settings.companyName,
          });
        } catch (error) {
          this.logger.error(`Failed to generate or send payslip email for payroll ${id}`, error);
          emailSent = false;
        }
      } else {
        this.logger.warn(`No email found for employee ${employee.id}`);
      }
    }

    // Create in-app notification
    if (method === 'in_app' || method === 'both') {
      try {
        const notification = this.notificationRepo.create({
          employeeId: employee.id,
          payrollRecordId: record.id,
          title: `Salary Slip - ${record.payPeriod}`,
          message: `Your salary slip for ${record.payPeriod} is ready. Net pay: ${fmt(record.netPay)}`,
          sentVia: method,
          emailSent,
        });
        await this.notificationRepo.save(notification);
        inAppNotification = true;
      } catch (error) {
        this.logger.error(`Failed to create in-app payslip notification for payroll ${id}`, error);
      }
    }

    // Update status to paid
    try {
      record.status = 'paid';
      await this.payrollRepo.save(record);
    } catch (error) {
      this.logger.error(`Failed to update payroll status to paid for payroll ${id}`, error);
    }

    return {
      success: true,
      emailSent,
      inAppNotification,
      message: this.buildResultMessage(method, emailSent, inAppNotification),
    };
  }

  private buildResultMessage(method: string, emailSent: boolean, inAppNotification: boolean): string {
    if (method === 'email') {
      return emailSent ? 'Payslip sent via email' : 'Email sending failed - check Brevo SMTP configuration';
    }
    if (method === 'in_app') {
      return inAppNotification ? 'Payslip notification sent to employee app' : 'Failed to send payslip notification in app';
    }
    // both
    const parts: string[] = [];
    parts.push(emailSent ? 'Email sent' : 'Email failed');
    parts.push(inAppNotification ? 'In-app notification created' : 'In-app notification failed');
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
