import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { Organization } from '../auth-core/entities/organization.entity';

interface MailRecipient {
  email: string;
  firstName: string;
}

interface MeetingDetails {
  title: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink?: string;
  description?: string;
}

interface LeaveDetails {
  leaveType: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  remarks?: string;
}

interface WfhDetails {
  date: string;
  endDate?: string;
  numberOfDays: number;
  remarks?: string;
}

interface ResignationRequestToHrDetails {
  hrEmail: string;
  organizationId: string;
  employeeName: string;
  employeeEmail?: string | null;
  message: string;
  proposedLastWorkingDay?: string | null;
  resignationPolicy?: string;
  noticePeriodDays: number;
}

interface ResignationStatusToEmployeeDetails {
  employeeEmail: string;
  employeeFirstName: string;
  organizationId: string;
  status: 'APPROVED' | 'REJECTED';
  hrRemarks?: string | null;
  approvedLastWorkingDay?: string | null;
  allowEarlyRelieving?: boolean;
  reviewerName?: string;
  resignationPolicy?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Organization)
    private orgRepo: Repository<Organization>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('BREVO_SMTP_HOST', 'smtp-relay.brevo.com'),
      port: this.configService.get<number>('BREVO_SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('BREVO_SMTP_USER'),
        pass: this.configService.get<string>('BREVO_SMTP_PASSWORD'),
      },
    });
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async getOrg(organizationId: string): Promise<Organization | null> {
    try {
      return await this.orgRepo.findOne({ where: { id: organizationId } });
    } catch {
      return null;
    }
  }

  private get fromAddress(): string {
    const name = this.configService.get<string>('MAIL_FROM_NAME', 'HRMS Notifications');
    const email = this.configService.get<string>('MAIL_FROM_EMAIL', 'a3a15c001@smtp-brevo.com');
    return `"${name}" <${email}>`;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  private buildEmailWrapper(orgName: string, orgLogoUrl: string | null, content: string): string {
    const logoHtml = orgLogoUrl
      ? `<img src="${orgLogoUrl}" alt="${orgName}" style="max-height:40px;max-width:160px;object-fit:contain;" />`
      : `<span style="font-size:18px;font-weight:700;color:#ffffff;">${orgName}</span>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HRMS Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>${logoHtml}</td>
                  <td align="right" style="font-size:12px;color:rgba(255,255,255,0.6);">HRMS Platform</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fb;border-top:1px solid #e8ecf0;padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:#9aa0ac;text-align:center;">
                This is an automated notification from <strong>${orgName}</strong> HRMS.<br/>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private statusBadge(status: 'APPROVED' | 'REJECTED'): string {
    const isApproved = status === 'APPROVED';
    const color = isApproved ? '#16a34a' : '#dc2626';
    const bg = isApproved ? '#dcfce7' : '#fee2e2';
    const label = isApproved ? '✓ Approved' : '✗ Rejected';
    return `<span style="display:inline-block;padding:6px 16px;background:${bg};color:${color};border-radius:20px;font-weight:700;font-size:14px;">${label}</span>`;
  }

  private infoRow(label: string, value: string): string {
    return `<tr>
      <td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${value}</td>
    </tr>`;
  }

  private async send(options: nodemailer.SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail(options);
      this.logger.log(`Email sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);
    }
  }

  // ─── Meeting Invite ──────────────────────────────────────────────────────────

  async sendMeetingInvite(
    recipients: MailRecipient[],
    meeting: MeetingDetails,
    organizationId: string,
  ): Promise<void> {
    const org = await this.getOrg(organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const dateStr = this.formatDate(meeting.scheduledAt);
    const timeStr = this.formatTime(meeting.scheduledAt);

    for (const recipient of recipients) {
      const content = `
        <h2 style="margin:0 0 8px;font-size:24px;color:#111827;">Meeting Invitation</h2>
        <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${recipient.firstName}, you have been invited to a meeting.</p>

        <div style="background:#f8f9fb;border-left:4px solid #3b82f6;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
          <h3 style="margin:0 0 16px;font-size:18px;color:#1e40af;">${meeting.title}</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${this.infoRow('Date', dateStr)}
            ${this.infoRow('Time', timeStr)}
            ${this.infoRow('Duration', `${meeting.durationMinutes} minutes`)}
            ${meeting.description ? this.infoRow('Agenda', meeting.description) : ''}
          </table>
        </div>

        ${meeting.meetingLink ? `
        <div style="text-align:center;margin:24px 0;">
          <a href="${meeting.meetingLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Join Meeting
          </a>
          <p style="margin:8px 0 0;font-size:12px;color:#9aa0ac;">or copy: ${meeting.meetingLink}</p>
        </div>` : ''}

        <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">Please add this to your calendar and be ready on time.</p>
      `;

      await this.send({
        from: this.fromAddress,
        to: recipient.email,
        replyTo: orgEmail,
        subject: `[Meeting] ${meeting.title} — ${dateStr} at ${timeStr}`,
        html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
      });
    }
  }

  // ─── Meeting Cancellation ────────────────────────────────────────────────────

  async sendMeetingCancellation(
    recipients: MailRecipient[],
    meeting: MeetingDetails,
    organizationId: string,
  ): Promise<void> {
    const org = await this.getOrg(organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const dateStr = this.formatDate(meeting.scheduledAt);
    const timeStr = this.formatTime(meeting.scheduledAt);

    for (const recipient of recipients) {
      const content = `
        <h2 style="margin:0 0 8px;font-size:24px;color:#dc2626;">Meeting Cancelled</h2>
        <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${recipient.firstName}, the following meeting has been cancelled.</p>

        <div style="background:#fff5f5;border-left:4px solid #dc2626;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
          <h3 style="margin:0 0 16px;font-size:18px;color:#dc2626;text-decoration:line-through;">${meeting.title}</h3>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${this.infoRow('Date', dateStr)}
            ${this.infoRow('Time', timeStr)}
            ${this.infoRow('Duration', `${meeting.durationMinutes} minutes`)}
          </table>
        </div>

        <p style="margin:0;font-size:14px;color:#6b7280;">Please update your calendar accordingly. Contact your manager for more details.</p>
      `;

      await this.send({
        from: this.fromAddress,
        to: recipient.email,
        replyTo: orgEmail,
        subject: `[Cancelled] ${meeting.title} — ${dateStr}`,
        html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
      });
    }
  }

  // ─── WFH Status ─────────────────────────────────────────────────────────────

  async sendWfhStatus(
    recipient: MailRecipient,
    status: 'APPROVED' | 'REJECTED',
    details: WfhDetails,
    organizationId: string,
  ): Promise<void> {
    const org = await this.getOrg(organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const isApproved = status === 'APPROVED';
    const heading = isApproved ? 'WFH Request Approved' : 'WFH Request Rejected';
    const headingColor = isApproved ? '#16a34a' : '#dc2626';
    const intro = isApproved
      ? `Hi ${recipient.firstName}, your Work from Home request has been approved.`
      : `Hi ${recipient.firstName}, unfortunately your Work from Home request has been rejected.`;

    const dateRange = details.endDate && details.endDate !== details.date
      ? `${details.date} – ${details.endDate}`
      : details.date;

    const content = `
      <h2 style="margin:0 0 8px;font-size:24px;color:${headingColor};">${heading}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${intro}</p>

      <div style="text-align:left;margin-bottom:24px;">${this.statusBadge(status)}</div>

      <div style="background:#f8f9fb;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${this.infoRow('Date(s)', dateRange)}
          ${this.infoRow('Days', `${details.numberOfDays} day${details.numberOfDays !== 1 ? 's' : ''}`)}
          ${details.remarks ? this.infoRow('Remarks', details.remarks) : ''}
        </table>
      </div>

      ${isApproved
        ? `<p style="margin:0;font-size:14px;color:#6b7280;">Please ensure you are available online during working hours and log your attendance via the HRMS portal.</p>`
        : `<p style="margin:0;font-size:14px;color:#6b7280;">For more information, please contact your manager or the HR department.</p>`}
    `;

    await this.send({
      from: this.fromAddress,
      to: recipient.email,
      replyTo: orgEmail,
      subject: `WFH Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'} — ${dateRange}`,
      html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
    });
  }

  // ─── Leave Status ────────────────────────────────────────────────────────────

  async sendLeaveStatus(
    recipient: MailRecipient,
    status: 'APPROVED' | 'REJECTED',
    details: LeaveDetails,
    organizationId: string,
  ): Promise<void> {
    const org = await this.getOrg(organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const isApproved = status === 'APPROVED';
    const heading = isApproved ? 'Leave Request Approved' : 'Leave Request Rejected';
    const headingColor = isApproved ? '#16a34a' : '#dc2626';
    const intro = isApproved
      ? `Hi ${recipient.firstName}, your leave request has been approved.`
      : `Hi ${recipient.firstName}, unfortunately your leave request has been rejected.`;

    const content = `
      <h2 style="margin:0 0 8px;font-size:24px;color:${headingColor};">${heading}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">${intro}</p>

      <div style="text-align:left;margin-bottom:24px;">${this.statusBadge(status)}</div>

      <div style="background:#f8f9fb;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${this.infoRow('Leave Type', details.leaveType)}
          ${this.infoRow('From', details.startDate)}
          ${this.infoRow('To', details.endDate)}
          ${this.infoRow('Days', `${details.numberOfDays} day${details.numberOfDays !== 1 ? 's' : ''}`)}
          ${details.remarks ? this.infoRow('Remarks', details.remarks) : ''}
        </table>
      </div>

      ${isApproved
        ? `<p style="margin:0;font-size:14px;color:#6b7280;">Your leave balance has been updated accordingly. Have a good time off!</p>`
        : `<p style="margin:0;font-size:14px;color:#6b7280;">For more information, please contact your manager or the HR department.</p>`}
    `;

    await this.send({
      from: this.fromAddress,
      to: recipient.email,
      replyTo: orgEmail,
      subject: `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'} — ${details.leaveType} (${details.startDate} to ${details.endDate})`,
      html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
    });
  }

  async sendResignationRequestToHr(details: ResignationRequestToHrDetails): Promise<void> {
    const org = await this.getOrg(details.organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const content = `
      <h2 style="margin:0 0 8px;font-size:24px;color:#111827;">New Resignation Request</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
        A new resignation request has been submitted and needs HR review.
      </p>

      <div style="background:#f8f9fb;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${this.infoRow('Employee', details.employeeName)}
          ${this.infoRow('Email', details.employeeEmail || 'Not available')}
          ${this.infoRow('Requested Last Day', details.proposedLastWorkingDay || 'Not specified')}
          ${this.infoRow('Notice Period', `${details.noticePeriodDays} days`)}
        </table>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;margin-bottom:18px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;letter-spacing:0.2px;">Employee Message</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;white-space:pre-line;">${details.message}</p>
      </div>

      ${
        details.resignationPolicy
          ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:600;letter-spacing:0.2px;">Current Resignation Policy</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#1e3a8a;white-space:pre-line;">${details.resignationPolicy}</p>
        </div>`
          : ''
      }
    `;

    await this.send({
      from: this.fromAddress,
      to: details.hrEmail,
      replyTo: details.employeeEmail || orgEmail,
      subject: `[Resignation] ${details.employeeName} submitted a resignation request`,
      html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
    });
  }

  async sendResignationStatusToEmployee(
    details: ResignationStatusToEmployeeDetails,
  ): Promise<void> {
    const org = await this.getOrg(details.organizationId);
    const orgName = org?.organizationName ?? 'Your Organization';
    const orgEmail = org?.email;

    const isApproved = details.status === 'APPROVED';
    const heading = isApproved
      ? 'Resignation Request Approved'
      : 'Resignation Request Rejected';
    const headingColor = isApproved ? '#16a34a' : '#dc2626';

    const content = `
      <h2 style="margin:0 0 8px;font-size:24px;color:${headingColor};">${heading}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">
        Hi ${details.employeeFirstName}, your resignation request has been reviewed by HR.
      </p>

      <div style="text-align:left;margin-bottom:24px;">${this.statusBadge(details.status)}</div>

      <div style="background:#f8f9fb;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${this.infoRow('Reviewed By', details.reviewerName || 'HR Team')}
          ${this.infoRow('Final Last Working Day', details.approvedLastWorkingDay || 'Not applicable')}
          ${this.infoRow('Early Relieving', details.allowEarlyRelieving ? 'Allowed' : 'No')}
          ${details.hrRemarks ? this.infoRow('HR Remarks', details.hrRemarks) : ''}
        </table>
      </div>

      ${
        details.resignationPolicy
          ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 18px;margin-bottom:16px;">
          <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:600;letter-spacing:0.2px;">Resignation Policy</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#1e3a8a;white-space:pre-line;">${details.resignationPolicy}</p>
        </div>`
          : ''
      }
    `;

    await this.send({
      from: this.fromAddress,
      to: details.employeeEmail,
      replyTo: orgEmail,
      subject: `Resignation Request ${isApproved ? 'Approved' : 'Rejected'}`,
      html: this.buildEmailWrapper(orgName, org?.logoUrl ?? null, content),
    });
  }
}
