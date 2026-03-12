import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('BREVO_SMTP_HOST', 'smtp-relay.brevo.com');
    const port = Number(this.configService.get<number | string>('BREVO_SMTP_PORT', 587));
    const user = this.configService.get<string>('BREVO_SMTP_USER');
    const pass = this.configService.get<string>('BREVO_SMTP_PASSWORD');
    this.isConfigured = Boolean(host && port && user && pass);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    if (!this.isConfigured) this.logger.warn('Brevo SMTP not configured. Email sending disabled.');
  }

  async sendPayslipEmail(params: {
    to: string;
    employeeName: string;
    payPeriod: string;
    netPay: string;
    pdfBuffer: Buffer;
    companyName?: string;
  }): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Email not sent - Brevo SMTP not configured');
      return false;
    }

    const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'HRMS Notifications');
    const fromEmail = this.configService.get<string>('MAIL_FROM_EMAIL') || this.configService.get<string>('BREVO_SMTP_USER') || 'noreply@yourdomain.com';

    const msg: nodemailer.SendMailOptions = {
      to: params.to,
      from: `"${fromName}" <${fromEmail}>`,
      subject: `Salary Slip - ${params.payPeriod} | ${params.companyName || 'Your Company'}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); border-radius: 12px; padding: 24px 32px; color: #ffffff; margin-bottom: 24px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700;">${params.companyName || 'Your Company'}</h1>
            <p style="margin: 4px 0 0; opacity: 0.85; font-size: 14px;">Salary Slip Notification</p>
          </div>
          <div style="padding: 0 8px;">
            <p style="font-size: 16px; color: #1e293b;">Dear <strong>${params.employeeName}</strong>,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              Your salary slip for <strong>${params.payPeriod}</strong> has been generated and is attached to this email.
            </p>
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
              <p style="margin: 0; font-size: 13px; color: #0369a1; font-weight: 600;">NET PAY</p>
              <p style="margin: 4px 0 0; font-size: 28px; font-weight: 800; color: #1e40af;">${params.netPay}</p>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
              You can also view your payslip in the HRMS mobile app under the Payslips section.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">
              This is an automated email. For any discrepancies, please contact your HR department.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          content: params.pdfBuffer,
          filename: `salary-slip-${params.payPeriod}.pdf`,
          contentType: 'application/pdf',
        },
      ],
    };

    try {
      await this.transporter.sendMail(msg);
      this.logger.log(`Payslip email sent to ${params.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send payslip email to ${params.to}`, error);
      return false;
    }
  }
}
