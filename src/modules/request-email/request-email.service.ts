import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  Not,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { isEmail } from 'class-validator';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';
import {
  RequestEmailKind,
  RequestEmailTemplate,
} from './entities/request-email-template.entity';
import { RequestEmailDelivery } from './entities/request-email-delivery.entity';
import {
  ApplicationEmailFieldsDto,
  PreviewRequestEmailDto,
  RequestEmailDraftDto,
  SaveRequestEmailTemplateDto,
  TestRequestEmailDto,
} from './dto/request-email.dto';
import { Employee } from '../employee/entities/employee.entity';
import { User } from '../auth-core/entities/user.entity';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { MailService } from '../mail/mail.service';
import { applicationDuration } from '../../shared/request-duration.util';
import { getFullName } from '../../shared/name.util';
import {
  renderEmailTemplate,
  REQUEST_EMAIL_PLACEHOLDERS,
  validateEmailTemplate,
} from './request-email-placeholders';

export type EmailActor = {
  userId?: string;
  id?: string;
  organizationId?: string;
  roles?: { roleName: string }[];
};
export type PreparedApplicationEmail = Pick<
  RequestEmailDelivery,
  | 'organizationId'
  | 'kind'
  | 'userId'
  | 'employeeName'
  | 'templateId'
  | 'recipients'
  | 'replyTo'
  | 'subject'
  | 'body'
>;

type ApplicationEmailPreview = {
  configured: boolean;
  templates: { id: string; name: string; isDefault: boolean }[];
  templateId?: string;
  recipients?: string[];
  subject?: string;
  body?: string;
  fingerprint?: string;
};

@Injectable()
export class RequestEmailService implements OnModuleInit {
  private readonly logger = new Logger(RequestEmailService.name);
  private lastWorkerErrorAt = 0;
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(RequestEmailTemplate)
    private readonly templates: Repository<RequestEmailTemplate>,
    @InjectRepository(RequestEmailDelivery)
    private readonly deliveries: Repository<RequestEmailDelivery>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(LeaveType)
    private readonly leaveTypes: Repository<LeaveType>,
    private readonly mail: MailService,
    private readonly timezone: OrganizationTimezoneService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    if (typeof this.templates?.query !== 'function') {
      this.schemaReady = true;
      return;
    }
    if (this.schemaPromise === null) {
      this.schemaPromise = (async () => {
        try {
          const { driver } = this.templates.manager.connection;
          const schema = (
            this.templates.metadata.schema ?? driver.schema ?? 'public'
          ).replace(/"/g, '""');

          await this.templates.query(`
            CREATE TABLE IF NOT EXISTS "${schema}"."request_email_templates" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              "organization_id" uuid NOT NULL REFERENCES "${schema}"."organizations"("organization_id") ON DELETE CASCADE,
              "kind" varchar(10) NOT NULL,
              "leave_type_id" uuid NULL REFERENCES "${schema}"."leave_types"("id") ON DELETE CASCADE,
              "name" varchar(100) NOT NULL,
              "recipients" jsonb NOT NULL,
              "subject_template" varchar(200) NOT NULL,
              "body_template" text NOT NULL,
              "enabled" boolean NOT NULL DEFAULT true,
              "is_default" boolean NOT NULL DEFAULT false,
              "version" integer NOT NULL DEFAULT 1,
              "created_at" timestamptz NOT NULL DEFAULT now(),
              "updated_at" timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT "CHK_request_email_template_kind" CHECK (
                ("kind" = 'leave' AND "leave_type_id" IS NOT NULL)
                OR ("kind" = 'wfh' AND "leave_type_id" IS NULL)
              )
            );
          `);
          await this.templates.query(`
            CREATE INDEX IF NOT EXISTS "IDX_request_email_templates_scope"
              ON "${schema}"."request_email_templates" ("organization_id", "kind", "leave_type_id");
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_default_leave"
              ON "${schema}"."request_email_templates" ("organization_id", "leave_type_id")
              WHERE "enabled" = true AND "is_default" = true AND "kind" = 'leave';
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_default_wfh"
              ON "${schema}"."request_email_templates" ("organization_id")
              WHERE "enabled" = true AND "is_default" = true AND "kind" = 'wfh';
          `);

          await this.templates.query(`
            CREATE TABLE IF NOT EXISTS "${schema}"."request_email_deliveries" (
              "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              "organization_id" uuid NOT NULL REFERENCES "${schema}"."organizations"("organization_id") ON DELETE CASCADE,
              "kind" varchar(10) NOT NULL,
              "request_id" uuid NOT NULL,
              "user_id" uuid NOT NULL REFERENCES "${schema}"."users"("user_id") ON DELETE CASCADE,
              "employee_name" varchar(400) NOT NULL,
              "template_id" uuid NULL REFERENCES "${schema}"."request_email_templates"("id") ON DELETE SET NULL,
              "recipients" jsonb NOT NULL,
              "reply_to" varchar(254) NULL,
              "subject" varchar(200) NOT NULL,
              "body" text NOT NULL,
              "status" varchar(20) NOT NULL DEFAULT 'pending',
              "attempts" integer NOT NULL DEFAULT 0,
              "next_attempt_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "locked_at" timestamptz NULL,
              "sent_at" timestamptz NULL,
              "last_error" text NULL,
              "created_at" timestamptz NOT NULL DEFAULT now(),
              "updated_at" timestamptz NOT NULL DEFAULT now()
            );
          `);
          await this.templates.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_delivery_request"
              ON "${schema}"."request_email_deliveries" ("kind", "request_id");
            CREATE INDEX IF NOT EXISTS "IDX_request_email_delivery_due"
              ON "${schema}"."request_email_deliveries" ("status", "next_attempt_at");
          `);

          this.schemaReady = true;
        } catch (error) {
          this.schemaPromise = null;
          this.logger.error(
            'Failed to initialize request email tables',
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
      })();
    }
    await this.schemaPromise;
  }

  private organization(actor: EmailActor): string {
    if (!actor.organizationId)
      throw new ForbiddenException('Organization context required');
    return actor.organizationId;
  }

  private isManagement(actor: EmailActor) {
    return (
      actor.roles?.some((role) =>
        ['ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN'].includes(
          role.roleName,
        ),
      ) ?? false
    );
  }

  private adminOrganization(actor: EmailActor) {
    if (!this.isManagement(actor))
      throw new ForbiddenException(
        'Only administrators can configure application emails',
      );
    return this.organization(actor);
  }

  private async validateLeaveType(
    organizationId: string,
    kind: RequestEmailKind,
    leaveTypeId?: string | null,
  ) {
    if (kind === RequestEmailKind.WFH) {
      if (leaveTypeId)
        throw new BadRequestException('WFH templates cannot have a leave type');
      return null;
    }
    if (!leaveTypeId) throw new BadRequestException('Select a leave type');
    const type = await this.leaveTypes.findOne({
      where: { id: leaveTypeId, organization: { id: organizationId } },
    });
    if (!type)
      throw new BadRequestException(
        'Leave type does not belong to your organization',
      );
    return type;
  }

  async list(actor: EmailActor, kind: RequestEmailKind) {
    await this.ensureSchema();
    const organizationId = this.adminOrganization(actor);
    return {
      templates: await this.templates.find({
        where: { organizationId, kind },
        order: { name: 'ASC', id: 'ASC' },
      }),
      placeholders: REQUEST_EMAIL_PLACEHOLDERS,
    };
  }

  async save(
    actor: EmailActor,
    kind: RequestEmailKind,
    dto: SaveRequestEmailTemplateDto,
    id?: string,
  ) {
    await this.ensureSchema();
    const organizationId = this.adminOrganization(actor);
    const leaveType = await this.validateLeaveType(
      organizationId,
      kind,
      dto.leaveTypeId,
    );
    validateEmailTemplate(dto.subjectTemplate);
    validateEmailTemplate(dto.bodyTemplate);
    if (dto.isDefault && !dto.enabled)
      throw new BadRequestException('A default template must be enabled');
    try {
      return await this.templates.manager.transaction(async (manager) => {
        const repo = manager.getRepository(RequestEmailTemplate);
        const existing = id
          ? await repo.findOne({
              where: { id, organizationId, kind },
              lock: { mode: 'pessimistic_write' },
            })
          : null;
        if (id && !existing)
          throw new NotFoundException('Email template not found');
        if (
          existing &&
          dto.version !== undefined &&
          existing.version !== dto.version
        )
          throw new ConflictException(
            'Template changed. Reload before saving.',
          );
        if (dto.isDefault)
          await repo.update(
            {
              organizationId,
              kind,
              leaveTypeId: leaveType?.id ?? IsNull(),
              isDefault: true,
              ...(id ? { id: Not(id) } : {}),
            },
            { isDefault: false },
          );
        const template = existing ?? repo.create({ organizationId, kind });
        Object.assign(template, {
          name: dto.name.trim(),
          leaveTypeId: leaveType?.id ?? null,
          recipients: dto.recipients,
          subjectTemplate: dto.subjectTemplate,
          bodyTemplate: dto.bodyTemplate,
          enabled: dto.enabled,
          isDefault: dto.isDefault,
        });
        return repo.save(template);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'A default template was changed concurrently. Reload configuration.',
        );
      throw error;
    }
  }

  async remove(actor: EmailActor, kind: RequestEmailKind, id: string) {
    await this.ensureSchema();
    const result = await this.templates.delete({
      id,
      kind,
      organizationId: this.adminOrganization(actor),
    });
    if (!result.affected)
      throw new NotFoundException('Email template not found');
    return { deleted: true };
  }

  async sendTestEmail(
    actor: EmailActor,
    kind: RequestEmailKind,
    dto: TestRequestEmailDto,
  ) {
    const organizationId = this.adminOrganization(actor);
    validateEmailTemplate(dto.subjectTemplate);
    validateEmailTemplate(dto.bodyTemplate);

    let leaveTypeName = 'Work from Home';
    if (kind === RequestEmailKind.LEAVE) {
      if (dto.leaveTypeId) {
        const type = await this.validateLeaveType(
          organizationId,
          kind,
          dto.leaveTypeId,
        );
        leaveTypeName = type?.name || 'Leave';
      } else {
        const firstType = await this.leaveTypes.findOne({
          where: { organization: { id: organizationId } },
          order: { name: 'ASC' },
        });
        leaveTypeName = firstType?.name || 'Casual Leave';
      }
    }

    const actorId = actor.userId || actor.id;
    const user = actorId
      ? await this.users.findOne({
          where: { id: actorId, organizationId },
          relations: ['organization'],
          select: [
            'id',
            'firstName',
            'middleName',
            'lastName',
            'email',
            'organizationId',
          ],
        })
      : null;
    const employee = actorId
      ? await this.employees.findOne({
          where: { userId: actorId, organizationId },
          relations: ['department', 'designation', 'organization', 'manager'],
        })
      : null;

    const employeeName = employee
      ? getFullName(employee.firstName, employee.middleName, employee.lastName)
      : user
        ? getFullName(user.firstName, user.middleName, user.lastName)
        : 'Alex Sharma';
    const email = employee?.workEmail || user?.email || '';
    const applicationDate = await this.timezone.getToday(organizationId);
    const context: Record<string, string> = {
      employee_name: employeeName || 'Alex Sharma',
      employee_code: employee?.employeeCode || 'EMP-001',
      employee_email: email || 'employee@company.com',
      department: employee?.department?.name || 'Engineering',
      designation: employee?.designation?.name || 'Software Engineer',
      leave_type: leaveTypeName,
      request_type:
        kind === RequestEmailKind.LEAVE ? 'Leave' : 'Work from Home',
      start_date: applicationDate,
      end_date: applicationDate,
      duration: '1',
      total_days: '1 day',
      reason: 'Sample test email to confirm email configuration and delivery.',
      organization_name:
        employee?.organization?.organizationName ||
        user?.organization?.organizationName ||
        'Your Organization',
      application_date: applicationDate,
      manager_name: employee?.manager
        ? getFullName(
            employee.manager.firstName,
            employee.manager.middleName,
            employee.manager.lastName,
          )
        : 'Reporting Manager',
    };

    const renderedSubject = renderEmailTemplate(
      dto.subjectTemplate,
      context,
    ).replace(/[\r\n]+/g, ' ');
    const subject = `[Test] ${renderedSubject}`.slice(0, 200);
    const body = renderEmailTemplate(dto.bodyTemplate, context);
    if (body.length > 20000) {
      throw new BadRequestException(
        'Generated email body is too long. Shorten your template.',
      );
    }

    try {
      await this.mail.sendRequestApplicationEmail(
        dto.recipients,
        subject,
        body,
        randomUUID(),
        email && isEmail(email) ? email : undefined,
      );
      return {
        sent: true,
        recipients: dto.recipients,
        subject,
      };
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? error.message.slice(0, 200)
          : 'Mail server rejected the request';
      this.logger.error(
        `Test application email failed kind=${kind}: ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(`Could not send test email: ${reason}`);
    }
  }

  private async buildPreview(
    actor: EmailActor,
    kind: RequestEmailKind,
    userId: string,
    fields: ApplicationEmailFieldsDto,
    templateId?: string,
  ): Promise<{
    preview: ApplicationEmailPreview;
    prepared: PreparedApplicationEmail | null;
  }> {
    await this.ensureSchema();
    const organizationId = this.organization(actor);
    const actorId = actor.userId || actor.id;
    if (
      actorId !== userId &&
      !this.isManagement(actor) &&
      !actor.roles?.some((role) => role.roleName === 'MANAGER')
    )
      throw new ForbiddenException(
        'You can only preview your own application email',
      );
    const user = await this.users.findOne({
      where: { id: userId, organizationId },
      relations: ['organization'],
      select: [
        'id',
        'firstName',
        'middleName',
        'lastName',
        'email',
        'organizationId',
      ],
    });
    if (!user)
      throw new ForbiddenException(
        'Employee does not belong to your organization',
      );
    const leaveType = await this.validateLeaveType(
      organizationId,
      kind,
      fields.leaveTypeId,
    );
    const start =
      kind === RequestEmailKind.LEAVE ? fields.startDate : fields.date;
    const end = fields.endDate || start;
    if (
      !start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) < Date.parse(start)
    )
      throw new BadRequestException('Provide a valid application date range');
    const templates = await this.templates.find({
      where: {
        organizationId,
        kind,
        leaveTypeId: leaveType?.id ?? IsNull(),
        enabled: true,
      },
      order: { isDefault: 'DESC', createdAt: 'ASC', id: 'ASC' },
    });
    const template = templateId
      ? templates.find((entry) => entry.id === templateId)
      : templates[0];
    if (templateId && !template)
      throw new ConflictException(
        'Selected email template is no longer available. Refresh preview.',
      );
    if (!template)
      return {
        preview: { configured: false as const, templates: [] },
        prepared: null,
      };
    const employee = await this.employees.findOne({
      where: { userId, organizationId },
      relations: ['department', 'designation', 'organization', 'manager'],
    });
    const employeeName = employee
      ? getFullName(employee.firstName, employee.middleName, employee.lastName)
      : getFullName(user.firstName, user.middleName, user.lastName);
    const email = employee?.workEmail || user.email;
    const applicationDate = await this.timezone.getToday(organizationId);
    const days = applicationDuration(kind, start, end, fields.duration);
    const context: Record<string, string> = {
      employee_name: employeeName || 'Employee',
      employee_code: employee?.employeeCode || 'Not specified',
      employee_email: email || 'Not specified',
      department: employee?.department?.name || 'Not specified',
      designation: employee?.designation?.name || 'Not specified',
      leave_type: leaveType?.name || 'Work from Home',
      request_type:
        kind === RequestEmailKind.LEAVE ? 'Leave' : 'Work from Home',
      start_date: start.slice(0, 10),
      end_date: end.slice(0, 10),
      duration: String(days),
      total_days: `${days} ${days === 1 ? 'day' : 'days'}`,
      reason: fields.reason?.trim() || 'Not provided',
      organization_name:
        employee?.organization?.organizationName ||
        user.organization?.organizationName ||
        'Your Organization',
      application_date: applicationDate,
      manager_name: employee?.manager
        ? getFullName(
            employee.manager.firstName,
            employee.manager.middleName,
            employee.manager.lastName,
          )
        : 'Not specified',
    };
    const subject = renderEmailTemplate(
      template.subjectTemplate,
      context,
    ).replace(/[\r\n]+/g, ' ');
    const body = renderEmailTemplate(template.bodyTemplate, context);
    if (subject.length > 200 || body.length > 20000)
      throw new BadRequestException(
        'Generated email is too long. Shorten request details or email template.',
      );
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          templateId: template.id,
          version: template.version,
          recipients: template.recipients,
          subjectTemplate: template.subjectTemplate,
          bodyTemplate: template.bodyTemplate,
          context,
        }),
      )
      .digest('hex');
    return {
      preview: {
        configured: true as const,
        templates: templates.map((entry) => ({
          id: entry.id,
          name: entry.name,
          isDefault: entry.isDefault,
        })),
        templateId: template.id,
        recipients: template.recipients,
        subject,
        body,
        fingerprint,
      },
      prepared: {
        organizationId,
        kind,
        userId,
        employeeName: context.employee_name,
        templateId: template.id,
        recipients: [...template.recipients],
        replyTo: email && isEmail(email) ? email : null,
        subject,
        body,
      } satisfies PreparedApplicationEmail,
    };
  }

  async preview(
    actor: EmailActor,
    kind: RequestEmailKind,
    userId: string,
    dto: PreviewRequestEmailDto,
  ) {
    return (await this.buildPreview(actor, kind, userId, dto, dto.templateId))
      .preview;
  }

  async prepare(
    actor: EmailActor,
    kind: RequestEmailKind,
    userId: string,
    fields: ApplicationEmailFieldsDto,
    draft?: RequestEmailDraftDto,
  ): Promise<PreparedApplicationEmail | null> {
    const result = await this.buildPreview(
      actor,
      kind,
      userId,
      fields,
      draft?.templateId,
    );
    if (!result.prepared || !result.preview.configured) return null;
    if (draft) {
      if (draft.fingerprint !== result.preview.fingerprint)
        throw new ConflictException(
          'Request details or email configuration changed. Refresh the email preview before submitting.',
        );
      if (
        !draft.subject.trim() ||
        !draft.body.trim() ||
        /[\r\n]/.test(draft.subject) ||
        draft.subject.length > 200 ||
        draft.body.length > 20000
      )
        throw new BadRequestException('Provide a valid email subject and body');
      result.prepared.subject = draft.subject;
      result.prepared.body = draft.body;
    }
    return result.prepared;
  }

  async queueAfterSuccess(
    requestId: string,
    prepared: PreparedApplicationEmail | null,
  ) {
    if (!prepared) return { status: 'not_configured' as const };
    await this.ensureSchema();
    try {
      let delivery = await this.deliveries.findOneBy({
        kind: prepared.kind,
        requestId,
        organizationId: prepared.organizationId,
      });
      if (!delivery) {
        try {
          delivery = await this.deliveries.save(
            this.deliveries.create({
              ...prepared,
              requestId,
              status: 'pending',
              attempts: 0,
              nextAttemptAt: new Date(),
            }),
          );
        } catch (error) {
          if (
            !(error instanceof QueryFailedError) ||
            (error.driverError as { code?: string }).code !== '23505'
          )
            throw error;
          delivery = await this.deliveries.findOneByOrFail({
            kind: prepared.kind,
            requestId,
            organizationId: prepared.organizationId,
          });
        }
      }
      const deliveryId = delivery.id;
      setImmediate(() => {
        void this.dispatch(deliveryId).catch(() =>
          this.logger.error(
            `Application email dispatch failed deliveryId=${deliveryId}`,
          ),
        );
      });
      return {
        status:
          delivery.status === 'sent' ? ('sent' as const) : ('queued' as const),
        deliveryId,
      };
    } catch (error) {
      this.logger.error(
        `Could not queue application email kind=${prepared.kind} requestId=${requestId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        status: 'failed' as const,
        message:
          'Request submitted, but email could not be queued. Contact your administrator.',
      };
    }
  }

  async dispatch(id: string) {
    const claimed = await this.deliveries
      .createQueryBuilder()
      .update()
      .set({
        status: 'sending',
        attempts: () => 'attempts + 1',
        lockedAt: new Date(),
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', { statuses: ['pending', 'failed'] })
      .andWhere('attempts < 5')
      .andWhere('next_attempt_at <= :now', { now: new Date() })
      .execute();
    if (!claimed.affected) return;
    const delivery = await this.deliveries.findOneByOrFail({ id });
    try {
      await this.mail.sendRequestApplicationEmail(
        delivery.recipients,
        delivery.subject,
        delivery.body,
        delivery.id,
        delivery.replyTo || undefined,
      );
      await this.deliveries.update(id, {
        status: 'sent',
        sentAt: new Date(),
        lockedAt: null,
        lastError: null,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? error.message.slice(0, 180)
          : 'Unknown mail error';
      await this.deliveries.update(id, {
        status: 'failed',
        lockedAt: null,
        nextAttemptAt: new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** (delivery.attempts - 1)),
        ),
        lastError:
          delivery.attempts >= 5
            ? `Email delivery failed after 5 attempts (${reason}). Click Retry to try again.`
            : `Delivery failed (${reason}); automatic retry scheduled.`,
      });
      this.logger.error(
        `Application email failed deliveryId=${id} attempt=${delivery.attempts}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron('*/10 * * * * *')
  async processPending() {
    try {
      await this.ensureSchema();
      await this.deliveries
        .createQueryBuilder()
        .update()
        .set({
          status: 'failed',
          lockedAt: null,
          nextAttemptAt: new Date(),
          lastError: 'Delivery interrupted; retry scheduled.',
        })
        .where('status = :status AND locked_at < :cutoff', {
          status: 'sending',
          cutoff: new Date(Date.now() - 10 * 60 * 1000),
        })
        .execute();
      const due = await this.deliveries.find({
        where: {
          status: In(['pending', 'failed']),
          attempts: LessThan(5),
          nextAttemptAt: LessThanOrEqual(new Date()),
        },
        order: { nextAttemptAt: 'ASC' },
        take: 20,
      });
      await Promise.allSettled(
        due
          .filter((delivery) => delivery.attempts < 5)
          .map((delivery) => this.dispatch(delivery.id)),
      );
    } catch (error) {
      if (Date.now() - this.lastWorkerErrorAt > 60000) {
        this.lastWorkerErrorAt = Date.now();
        this.logger.error(
          'Application email retry worker unavailable',
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async listDeliveries(actor: EmailActor, kind: RequestEmailKind) {
    await this.ensureSchema();
    return this.deliveries.find({
      where: { organizationId: this.adminOrganization(actor), kind },
      select: [
        'id',
        'requestId',
        'employeeName',
        'recipients',
        'subject',
        'status',
        'attempts',
        'lastError',
        'createdAt',
        'sentAt',
      ],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getDeliveryForRequest(
    actor: EmailActor,
    kind: RequestEmailKind,
    requestId: string,
  ) {
    const organizationId = this.adminOrganization(actor);
    await this.ensureSchema();
    const delivery = await this.deliveries.findOne({
      where: { organizationId, kind, requestId },
      select: ['recipients', 'subject', 'body', 'status', 'sentAt'],
    });
    return { delivery };
  }

  async retry(actor: EmailActor, kind: RequestEmailKind, id: string) {
    await this.ensureSchema();
    const organizationId = this.adminOrganization(actor);
    const result = await this.deliveries.update(
      { id, organizationId, kind, status: 'failed' },
      {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    );
    if (!result.affected)
      throw new ConflictException(
        'Only failed deliveries in your organization can be retried',
      );
    setImmediate(() => {
      void this.dispatch(id).catch(() =>
        this.logger.error(`Application email retry failed deliveryId=${id}`),
      );
    });
    return { status: 'queued' };
  }
}
