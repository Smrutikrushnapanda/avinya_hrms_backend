import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { RequestEmailController } from './request-email.controller';
import { EmailActor, RequestEmailService } from './request-email.service';
import {
  RequestEmailKind,
  RequestEmailTemplate,
} from './entities/request-email-template.entity';
import { RequestEmailDelivery } from './entities/request-email-delivery.entity';
import { SaveRequestEmailTemplateDto } from './dto/request-email.dto';
import { Organization } from '../auth-core/entities/organization.entity';
import { User } from '../auth-core/entities/user.entity';
import { Role } from '../auth-core/entities/role.entity';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { Employee } from '../employee/entities/employee.entity';
import { Department } from '../employee/entities/department.entity';
import { Designation } from '../employee/entities/designation.entity';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveApproval } from '../leave/entities/leave-approval.entity';
import { WfhRequest } from '../wfh/entities/wfh-request.entity';
import { WfhApproval } from '../wfh/entities/wfh-approval.entity';
import { WfhBalance } from '../wfh/entities/wfh-balance.entity';
import { EmployeeWfhLimitEntity } from '../wfh/entities/employee-wfh-limit.entity';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { LeaveController } from '../leave/leave.controller';
import { LeaveService } from '../leave/leave.service';
import { WfhController } from '../wfh/wfh.controller';
import { WfhService } from '../wfh/wfh.service';
import { MailService } from '../mail/mail.service';
import { MessageService } from '../message/message.service';
import { MessageGateway } from '../message/message.gateway';
import { AttendanceService } from '../attendance/attendance.service';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';

const url = process.env.ASSIGN_WORK_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration(
  'Request email HTTP, PostgreSQL and existing application workflows',
  () => {
    let db: DataSource;
    let app: INestApplication<App>;
    let service: RequestEmailService;
    let dispatchSpy: jest.SpyInstance;
    let realDispatch: (id: string) => Promise<void>;
    const schema = `request_email_${Date.now()}`;
    const org = randomUUID(),
      otherOrg = randomUUID(),
      userId = randomUUID(),
      managerId = randomUUID(),
      foreignUserId = randomUUID();
    const admin: EmailActor = {
      id: userId,
      organizationId: org,
      roles: [{ roleName: 'ADMIN' }],
    };
    const actor: EmailActor = { ...admin, roles: [{ roleName: 'EMPLOYEE' }] };
    const mail = {
      sendRequestApplicationEmail: jest.fn().mockResolvedValue(undefined),
      sendLeaveStatus: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = { emitToUser: jest.fn() };
    let leaveTypeId: string, foreignTypeId: string;
    let leaveTemplate: RequestEmailTemplate, wfhTemplate: RequestEmailTemplate;
    const leaveFields = () => ({
      leaveTypeId,
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      duration: 1,
      reason: 'Personal <literal> {{employee_name}}',
    });
    const wfhFields = () => ({
      date: '2026-12-01',
      endDate: '2026-12-03',
      reason: 'Home repairs',
    });
    const template = (kind: RequestEmailKind): SaveRequestEmailTemplateDto => ({
      name: 'Standard',
      ...(kind === RequestEmailKind.LEAVE ? { leaveTypeId } : {}),
      recipients: ['hr@example.com', 'manager@example.com'],
      subjectTemplate: '{{request_type}}: {{employeeName}}',
      bodyTemplate:
        '{{employee_name}} | {{employee_code}} | {{employee_email}} | {{department}} | {{designation}} | {{leave_type}} | {{start_date}} | {{end_date}} | {{duration}} | {{total_days}} | {{reason}} | {{organization_name}} | {{application_date}} | {{manager_name}}',
      enabled: true,
      isDefault: true,
    });
    const http = (
      method: 'get' | 'post' | 'put' | 'delete',
      route: string,
      role = 'ADMIN',
      organization = org,
      user = userId,
    ) =>
      request(app.getHttpServer())
        [method](route)
        .set('x-test-role', role)
        .set('x-test-org', organization)
        .set('x-test-user', user);

    beforeAll(async () => {
      if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
        throw new Error('Tests require isolated local PostgreSQL');
      db = new DataSource({
        type: 'postgres',
        url,
        schema,
        entities: [path.join(__dirname, '/../**/entities/*.entity.ts')],
        synchronize: false,
      });
      await db.initialize();
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.synchronize();
      await db.query(
        `DROP TABLE "${schema}".request_email_deliveries, "${schema}".request_email_templates`,
      );
      await db.query(`
        ALTER TABLE "${schema}".employees DROP COLUMN education_certificate_url,
          DROP COLUMN experience_letter_url, DROP COLUMN bank_proof_url;
        ALTER TABLE "${schema}".designations DROP COLUMN department_id;
      `);
      for (let run = 0; run < 2; run++) {
        const result = spawnSync(
          'npm',
          ['run', 'repair:request-email-schema'],
          {
            cwd: path.resolve(__dirname, '../../..'),
            env: {
              ...process.env,
              DATABASE_URL: url,
              DB_SCHEMA: schema,
              DB_SSL: 'false',
              NODE_ENV: 'production',
              DB_SYNCHRONIZE: 'false',
            },
            encoding: 'utf8',
            timeout: 25000,
          },
        );
        expect({ status: result.status, stderr: result.stderr }).toEqual(
          expect.objectContaining({ status: 0 }),
        );
      }
      await db.getRepository(Organization).save([
        { id: org, organizationName: 'Acme Test' },
        { id: otherOrg, organizationName: 'Other Tenant' },
      ]);
      for (const [id, organizationId, firstName] of [
        [userId, org, 'Alex'],
        [managerId, org, 'Manager'],
        [foreignUserId, otherOrg, 'Foreign'],
      ])
        await db.getRepository(User).save({
          id,
          organizationId,
          firstName,
          lastName: 'Tester',
          userName: id,
          email: `${id}@example.com`,
          password: 'unused-test-hash',
        });
      const department = await db
        .getRepository(Department)
        .save({ organizationId: org, name: 'Engineering' });
      const designation = await db.getRepository(Designation).save({
        organizationId: org,
        departmentId: department.id,
        name: 'Developer',
      });
      const manager = await db.getRepository(Employee).save({
        organizationId: org,
        userId: managerId,
        employeeCode: 'MANAGER',
        firstName: 'Morgan',
        lastName: 'Manager',
        dateOfJoining: new Date(),
      });
      await db.getRepository(Employee).save({
        organizationId: org,
        userId,
        employeeCode: 'EMP-1',
        firstName: 'Alex',
        lastName: 'Employee',
        workEmail: 'alex@example.com',
        dateOfJoining: new Date(),
        departmentId: department.id,
        designationId: designation.id,
        reportingTo: manager.id,
      });
      leaveTypeId = (
        await db
          .getRepository(LeaveType)
          .save({ name: 'Annual', organization: { id: org } })
      ).id;
      foreignTypeId = (
        await db
          .getRepository(LeaveType)
          .save({ name: 'Foreign', organization: { id: otherOrg } })
      ).id;
      await db.getRepository(WfhBalance).save({
        user: { id: userId },
        openingBalance: 100,
        closingBalance: 100,
      });
      await db.getRepository(EmployeeWfhLimitEntity).save({
        user: { id: userId },
        organization: { id: org },
        isEnabled: true,
        maxDaysPerMonth: 100,
      });
      const fixture = await Test.createTestingModule({
        imports: [CacheModule.register()],
        controllers: [RequestEmailController, LeaveController, WfhController],
        providers: [
          RequestEmailService,
          LeaveService,
          WfhService,
          { provide: DataSource, useValue: db },
          ...db.entityMetadatas.map((m) => ({
            provide: getRepositoryToken(m.target as new () => object),
            useValue: db.getRepository(m.target),
          })),
          { provide: MailService, useValue: mail },
          { provide: MessageGateway, useValue: gateway },
          {
            provide: MessageService,
            useValue: { createMessage: jest.fn().mockResolvedValue({}) },
          },
          { provide: AttendanceService, useValue: {} },
          {
            provide: OrganizationTimezoneService,
            useValue: { getToday: jest.fn().mockResolvedValue('2026-11-25') },
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context: ExecutionContext) {
            const req = context.switchToHttp().getRequest<{
              headers: Record<string, string>;
              user?: unknown;
            }>();
            if (!req.headers['x-test-role']) return false;
            req.user = {
              id: req.headers['x-test-user'],
              organizationId: req.headers['x-test-org'],
              roles: [{ roleName: req.headers['x-test-role'] }],
            };
            return true;
          },
        } satisfies CanActivate)
        .compile();
      app = fixture.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      service = fixture.get(RequestEmailService);
      realDispatch = (id: string) =>
        RequestEmailService.prototype.dispatch.call(
          service,
          id,
        ) as Promise<void>;
      dispatchSpy = jest
        .spyOn(service, 'dispatch')
        .mockResolvedValue(undefined);
    }, 60000);
    afterAll(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      if (app) await app.close();
      if (db?.isInitialized) {
        await db.query(`DROP SCHEMA "${schema}" CASCADE`);
        await db.destroy();
      }
      jest.restoreAllMocks();
    });
    beforeEach(() => {
      mail.sendRequestApplicationEmail.mockReset().mockResolvedValue(undefined);
    });

    it('installs both email tables and loads configuration for both request types', async () => {
      const runner = db.createQueryRunner();
      try {
        for (const name of [
          'request_email_templates',
          'request_email_deliveries',
        ]) {
          const table = await runner.getTable(`${schema}.${name}`);
          expect(table.columns.map((c) => c.name).sort()).toEqual(
            db
              .getMetadata(name)
              .columns.map((c) => c.databaseName)
              .sort(),
          );
          expect(table.foreignKeys.length).toBe(
            name === 'request_email_templates' ? 2 : 3,
          );
        }
      } finally {
        await runner.release();
      }
      for (const kind of [RequestEmailKind.LEAVE, RequestEmailKind.WFH]) {
        const response = await http(
          'get',
          `/${kind}/email-configuration`,
        ).expect(200);
        expect(response.body.templates).toEqual([]);
      }
    });
    it('requires authentication and management role for configuration', async () => {
      await request(app.getHttpServer())
        .get('/leave/email-configuration')
        .expect(403);
      for (const route of ['leave', 'wfh']) {
        await http('get', `/${route}/email-configuration`, 'EMPLOYEE').expect(
          403,
        );
        await http('post', `/${route}/email-configuration`, 'EMPLOYEE')
          .send(template(route as RequestEmailKind))
          .expect(403);
      }
    });
    it('creates multiple templates, normalizes recipients, and retains one default per scope', async () => {
      for (const kind of [RequestEmailKind.LEAVE, RequestEmailKind.WFH]) {
        const created = await http('post', `/${kind}/email-configuration`)
          .send({
            ...template(kind),
            recipients: [' HR@Example.com ', 'manager@example.com'],
          })
          .expect(201);
        const saved = created.body as RequestEmailTemplate;
        expect(saved.recipients).toEqual([
          'hr@example.com',
          'manager@example.com',
        ]);
        const alternate = await service.save(admin, kind, {
          ...template(kind),
          name: 'Alternate',
          isDefault: false,
        });
        expect(alternate.id).not.toBe(saved.id);
        const updated = await http(
          'put',
          `/${kind}/email-configuration/${alternate.id}`,
        )
          .send({
            ...template(kind),
            name: 'Alternate',
            isDefault: false,
            version: alternate.version,
            recipients: [' hr@example.com ', ' payroll@example.com '],
          })
          .expect(200);
        if (kind === RequestEmailKind.LEAVE) leaveTemplate = saved;
        else wfhTemplate = saved;
        const list = await http('get', `/${kind}/email-configuration`).expect(
          200,
        );
        const listed = (list.body as { templates: RequestEmailTemplate[] })
          .templates;
        expect(listed).toHaveLength(2);
        expect(
          listed.find((entry) => entry.id === saved.id)?.recipients,
        ).toEqual(saved.recipients);
        expect(listed.find((entry) => entry.id === alternate.id)).toMatchObject(
          {
            recipients: ['hr@example.com', 'payroll@example.com'],
            version: updated.body.version,
          },
        );
      }
    });
    it.each([RequestEmailKind.LEAVE, RequestEmailKind.WFH])(
      'formats %s test email dates as day/month/year',
      async (kind) => {
        await http('post', `/${kind}/email-configuration/test`)
          .send({
            ...(kind === RequestEmailKind.LEAVE ? { leaveTypeId } : {}),
            recipients: ['hr@example.com'],
            subjectTemplate: 'Applied {{application_date}}',
            bodyTemplate: '{{start_date}} to {{end_date}}',
          })
          .expect(200);
        expect(mail.sendRequestApplicationEmail).toHaveBeenCalledWith(
          ['hr@example.com'],
          '[Test] Applied 25/11/2026',
          '25/11/2026 to 25/11/2026',
          expect.any(String),
          'alex@example.com',
        );
      },
    );
    it.each([
      ['recipients', []],
      ['recipients', ['bad']],
      ['subjectTemplate', 'bad\r\nBcc:attack@example.com'],
      ['bodyTemplate', '{{unknown}}'],
      ['bodyTemplate', '{{reason()}}'],
      ['enabled', 'true'],
      ['organizationId', otherOrg],
    ])('rejects invalid configuration %s', async (field, value) => {
      await http('post', '/leave/email-configuration')
        .send({ ...template(RequestEmailKind.LEAVE), [field]: value })
        .expect(400);
    });
    it('rejects cross-tenant template operations and leave type links', async () => {
      await http('post', '/leave/email-configuration')
        .send({
          ...template(RequestEmailKind.LEAVE),
          leaveTypeId: foreignTypeId,
        })
        .expect(400);
      await http('post', '/wfh/email-configuration')
        .send({ ...template(RequestEmailKind.WFH), leaveTypeId })
        .expect(400);
      await http(
        'put',
        `/leave/email-configuration/${leaveTemplate.id}`,
        'ADMIN',
        otherOrg,
        foreignUserId,
      )
        .send({
          ...template(RequestEmailKind.LEAVE),
          leaveTypeId: foreignTypeId,
        })
        .expect(404);
      await http(
        'delete',
        `/leave/email-configuration/${leaveTemplate.id}`,
        'ADMIN',
        otherOrg,
        foreignUserId,
      ).expect(404);
      const list = await http(
        'get',
        '/leave/email-configuration',
        'ADMIN',
        otherOrg,
        foreignUserId,
      ).expect(200);
      expect(
        (list.body as { templates: RequestEmailTemplate[] }).templates,
      ).toHaveLength(0);
    });
    it('renders authoritative employee details, all placeholders, literal reasons and half days', async () => {
      const preview = await service.preview(
        actor,
        RequestEmailKind.LEAVE,
        userId,
        leaveFields(),
      );
      expect(preview).toMatchObject({
        configured: true,
        templateId: leaveTemplate.id,
        subject: 'Leave: Alex Employee',
      });
      expect(preview.body).toBe(
        'Alex Employee | EMP-1 | alex@example.com | Engineering | Developer | Annual | 01/12/2026 | 03/12/2026 | 3 | 3 days | Personal <literal> {{employee_name}} | Acme Test | 25/11/2026 | Morgan Manager',
      );
      const half = await service.preview(
        actor,
        RequestEmailKind.LEAVE,
        userId,
        { ...leaveFields(), endDate: '2026-12-01', duration: 0.5 },
      );
      expect(half.body).toContain(' | 0.5 | 0.5 days | ');
      expect(mail.sendRequestApplicationEmail).not.toHaveBeenCalled();
    });
    it('blocks preview for another employee, tenant, type and reversed date range', async () => {
      await http('post', `/leave/email-preview/${managerId}`, 'EMPLOYEE')
        .send(leaveFields())
        .expect(403);
      await http('post', `/wfh/email-preview/${foreignUserId}`)
        .send(wfhFields())
        .expect(403);
      await http('post', `/leave/email-preview/${userId}`, 'EMPLOYEE')
        .send({ ...leaveFields(), leaveTypeId: foreignTypeId })
        .expect(400);
      await http('post', `/leave/email-preview/${userId}`, 'EMPLOYEE')
        .send({ ...leaveFields(), endDate: '2026-11-01' })
        .expect(400);
    });
    it.each([undefined, '', ' \t\n ', 123])(
      'rejects an invalid leave application reason %j before creating a request',
      async (reason) => {
        const before = await db.getRepository(LeaveRequest).count();
        const result = await http('post', `/leave/apply/${userId}`, 'EMPLOYEE')
          .send({ ...leaveFields(), reason })
          .expect(400);
        expect(result.body.message).toContain('Leave reason is required.');
        expect(await db.getRepository(LeaveRequest).count()).toBe(before);
      },
    );
    it('rejects stale preview before creating a leave request', async () => {
      const preview = await service.preview(
        actor,
        RequestEmailKind.LEAVE,
        userId,
        leaveFields(),
      );
      const before = await db.getRepository(LeaveRequest).count();
      await http('post', `/leave/apply/${userId}`, 'EMPLOYEE')
        .send({
          ...leaveFields(),
          reason: 'Changed',
          emailDraft: {
            templateId: preview.templateId,
            fingerprint: preview.fingerprint,
            subject: 'Edited',
            body: 'Edited body',
          },
        })
        .expect(409);
      expect(await db.getRepository(LeaveRequest).count()).toBe(before);
      expect(await db.getRepository(RequestEmailDelivery).count()).toBe(0);
    });
    it.each([RequestEmailKind.LEAVE, RequestEmailKind.WFH])(
      'submits %s using existing balances/approvals and queues only finalized content',
      async (kind) => {
        const fields =
          kind === RequestEmailKind.LEAVE ? leaveFields() : wfhFields();
        const preview = await service.preview(actor, kind, userId, fields);
        expect(preview.body).toContain('01/12/2026 | 03/12/2026');
        expect(preview.body).toContain('25/11/2026');
        const applied = await http(
          'post',
          `/${kind}/apply/${userId}`,
          'EMPLOYEE',
        )
          .send({
            ...fields,
            emailDraft: {
              templateId: preview.templateId,
              fingerprint: preview.fingerprint,
              subject: 'Final edited subject',
              body: 'Final edited body <literal>',
            },
          })
          .expect(201);
        expect(
          applied.body as {
            id: string;
            emailDelivery: { status: string; deliveryId: string };
          },
        ).toMatchObject({
          status: 'PENDING',
          numberOfDays: 3,
          emailDelivery: { status: 'queued' },
        });
        const delivery = await db
          .getRepository(RequestEmailDelivery)
          .findOneByOrFail({
            requestId: (
              applied.body as {
                id: string;
                emailDelivery: { status: string; deliveryId: string };
              }
            ).id,
          });
        expect(delivery).toMatchObject({
          organizationId: org,
          recipients: ['hr@example.com', 'manager@example.com'],
          subject: 'Final edited subject',
          body: 'Final edited body <literal>',
          status: 'pending',
          replyTo: 'alex@example.com',
        });
        const detailRoute = `/${kind}/email-deliveries/by-request/${delivery.requestId}`;
        const detail = await http('get', detailRoute, 'ADMIN')
          .expect('Cache-Control', 'no-store')
          .expect(200);
        expect(detail.body).toEqual({
          delivery: {
            recipients: delivery.recipients,
            subject: 'Final edited subject',
            body: 'Final edited body <literal>',
            status: 'pending',
            sentAt: null,
          },
        });
        await http('get', detailRoute, 'EMPLOYEE').expect(403);
        await http('get', detailRoute, 'ADMIN', otherOrg, foreignUserId).expect(
          200,
          { delivery: null },
        );
        const approval =
          kind === RequestEmailKind.LEAVE
            ? await db.getRepository(LeaveApproval).findOne({
                where: {
                  leaveRequest: {
                    id: (
                      applied.body as {
                        id: string;
                        emailDelivery: { status: string; deliveryId: string };
                      }
                    ).id,
                  },
                },
                relations: ['approver'],
              })
            : await db.getRepository(WfhApproval).findOne({
                where: {
                  wfhRequest: {
                    id: (
                      applied.body as {
                        id: string;
                        emailDelivery: { status: string; deliveryId: string };
                      }
                    ).id,
                  },
                },
                relations: ['approver'],
              });
        expect(approval).toMatchObject({
          status: 'PENDING',
          approver: { id: managerId },
        });
        expect(mail.sendRequestApplicationEmail).not.toHaveBeenCalled();
        await Promise.all([
          realDispatch(delivery.id),
          realDispatch(delivery.id),
        ]);
        expect(mail.sendRequestApplicationEmail).toHaveBeenCalledTimes(1);
        expect(mail.sendRequestApplicationEmail).toHaveBeenCalledWith(
          delivery.recipients,
          delivery.subject,
          delivery.body,
          delivery.id,
          'alex@example.com',
        );
        expect(
          (
            await db
              .getRepository(RequestEmailDelivery)
              .findOneByOrFail({ id: delivery.id })
          ).status,
        ).toBe('sent');
        await service.queueAfterSuccess(
          (
            applied.body as {
              id: string;
              emailDelivery: { status: string; deliveryId: string };
            }
          ).id,
          delivery,
        );
        await realDispatch(delivery.id);
        expect(mail.sendRequestApplicationEmail).toHaveBeenCalledTimes(1);
      },
    );
    it('preserves requests when SMTP fails and supports isolated admin retry', async () => {
      const applied = await http('post', `/wfh/apply/${userId}`, 'EMPLOYEE')
        .send(wfhFields())
        .expect(201);
      const id = (
        applied.body as {
          id: string;
          emailDelivery: { status: string; deliveryId: string };
        }
      ).emailDelivery.deliveryId;
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      mail.sendRequestApplicationEmail.mockRejectedValueOnce(
        new Error('Test SMTP failure'),
      );
      await realDispatch(id);
      log.mockRestore();
      expect(
        (
          await db.getRepository(WfhRequest).findOneByOrFail({
            id: (
              applied.body as {
                id: string;
                emailDelivery: { status: string; deliveryId: string };
              }
            ).id,
          })
        ).status,
      ).toBe('PENDING');
      expect(
        await db.getRepository(RequestEmailDelivery).findOneByOrFail({ id }),
      ).toMatchObject({ status: 'failed', attempts: 1 });
      await http(
        'post',
        `/wfh/email-deliveries/${id}/retry`,
        'EMPLOYEE',
      ).expect(403);
      await http(
        'post',
        `/wfh/email-deliveries/${id}/retry`,
        'ADMIN',
        otherOrg,
        foreignUserId,
      ).expect(409);
      await http('post', `/wfh/email-deliveries/${id}/retry`).expect(200);
      await realDispatch(id);
      expect(
        (await db.getRepository(RequestEmailDelivery).findOneByOrFail({ id }))
          .status,
      ).toBe('sent');
      const rows = await http(
        'get',
        '/wfh/email-deliveries',
        'ADMIN',
        otherOrg,
        foreignUserId,
      ).expect(200);
      expect(rows.body).toEqual([]);
    });
    it('does not queue emails for unsuccessful business submissions', async () => {
      await db
        .getRepository(WfhBalance)
        .update({ user: { id: userId } }, { closingBalance: 0 });
      const count = await db.getRepository(RequestEmailDelivery).count();
      await http('post', `/wfh/apply/${userId}`, 'EMPLOYEE')
        .send(wfhFields())
        .expect(400);
      expect(await db.getRepository(RequestEmailDelivery).count()).toBe(count);
      await db
        .getRepository(WfhBalance)
        .update({ user: { id: userId } }, { closingBalance: 100 });
    });
    it('disables application emails without breaking legacy apply payloads', async () => {
      await db
        .getRepository(RequestEmailTemplate)
        .update(
          { organizationId: org, kind: RequestEmailKind.LEAVE },
          { enabled: false, isDefault: false },
        );
      const preview = await http(
        'post',
        `/leave/email-preview/${userId}`,
        'EMPLOYEE',
      )
        .send(leaveFields())
        .expect(200);
      expect((preview.body as { configured: boolean }).configured).toBe(false);
      const applied = await http('post', `/leave/apply/${userId}`, 'EMPLOYEE')
        .send({ ...leaveFields(), reason: '  Personal appointment  ' })
        .expect(201);
      expect(applied.body.reason).toBe('Personal appointment');
      expect(
        (
          applied.body as {
            id: string;
            emailDelivery: { status: string; deliveryId: string };
          }
        ).emailDelivery.status,
      ).toBe('not_configured');
      expect(
        await db.getRepository(RequestEmailDelivery).findOneBy({
          requestId: (
            applied.body as {
              id: string;
              emailDelivery: { status: string; deliveryId: string };
            }
          ).id,
        }),
      ).toBeNull();
    });
    it('requires and saves a trimmed reason for an admin rejection', async () => {
      const requests = db.getRepository(LeaveRequest);
      const approvals = db.getRepository(LeaveApproval);
      const { startDate, endDate, reason } = leaveFields();
      const request = await requests.save({
        user: { id: userId },
        leaveType: { id: leaveTypeId },
        startDate,
        endDate,
        reason,
        numberOfDays: 3,
      });
      const approval = await approvals.save({
        leaveRequest: request,
        approver: { id: managerId },
        level: 1,
        status: 'PENDING',
      });
      const role = await db.getRepository(Role).save({ roleName: 'ADMIN' });
      await db.getRepository(UserRole).save({ user: { id: managerId }, role });

      const route = `/leave/approve/${request.id}/${managerId}`;
      for (const remarks of [undefined, '', ' \t\n ']) {
        const result = await http('post', route, 'ADMIN', org, managerId)
          .send({ approve: false, remarks })
          .expect(400);
        expect(result.body.message).toContain('Rejection reason is required.');
      }
      expect(await requests.findOneByOrFail({ id: request.id })).toMatchObject({
        status: 'PENDING',
      });
      await http('post', route, 'ADMIN', org, managerId)
        .send({ approve: false, remarks: '  Coverage is unavailable.  ' })
        .expect(201);
      expect(await requests.findOneByOrFail({ id: request.id })).toMatchObject({
        status: 'REJECTED',
      });
      expect(
        await approvals.findOneByOrFail({ id: approval.id }),
      ).toMatchObject({
        status: 'REJECTED',
        remarks: 'Coverage is unavailable.',
      });
    });
    it('versions edits, invalidates previews and handles deleted selected templates', async () => {
      const preview = await service.preview(
        actor,
        RequestEmailKind.WFH,
        userId,
        wfhFields(),
      );
      const updated = await service.save(
        admin,
        RequestEmailKind.WFH,
        {
          ...template(RequestEmailKind.WFH),
          version: wfhTemplate.version,
          name: 'Changed',
        },
        wfhTemplate.id,
      );
      expect(updated.version).toBeGreaterThan(wfhTemplate.version);
      await expect(
        service.save(
          admin,
          RequestEmailKind.WFH,
          { ...template(RequestEmailKind.WFH), version: wfhTemplate.version },
          wfhTemplate.id,
        ),
      ).rejects.toThrow('Template changed');
      await expect(
        service.prepare(actor, RequestEmailKind.WFH, userId, wfhFields(), {
          templateId: preview.templateId,
          fingerprint: preview.fingerprint,
          subject: 'Test',
          body: 'Test',
        }),
      ).rejects.toThrow('Refresh the email preview');
      await service.remove(admin, RequestEmailKind.WFH, wfhTemplate.id);
      await expect(
        service.preview(actor, RequestEmailKind.WFH, userId, {
          ...wfhFields(),
          templateId: wfhTemplate.id,
        }),
      ).rejects.toThrow('no longer available');
    });
    it('worker skips exhausted retries and recovers interrupted deliveries', async () => {
      const repo = db.getRepository(RequestEmailDelivery);
      const prepared = await service.prepare(
        actor,
        RequestEmailKind.WFH,
        userId,
        wfhFields(),
      );
      const exhausted = await repo.save(
        repo.create({
          ...prepared,
          requestId: randomUUID(),
          status: 'failed',
          attempts: 5,
          nextAttemptAt: new Date(0),
        }),
      );
      const interrupted = await repo.save(
        repo.create({
          ...prepared,
          requestId: randomUUID(),
          status: 'sending',
          attempts: 1,
          nextAttemptAt: new Date(0),
          lockedAt: new Date(Date.now() - 11 * 60000),
        }),
      );
      const dispatch = dispatchSpy;
      dispatch.mockClear();
      await service.processPending();
      expect(dispatch).not.toHaveBeenCalledWith(exhausted.id);
      expect(dispatch).toHaveBeenCalledWith(interrupted.id);
      expect((await repo.findOneByOrFail({ id: interrupted.id })).status).toBe(
        'failed',
      );
    });
  },
);
