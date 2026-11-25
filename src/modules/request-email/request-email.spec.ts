import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApplyLeaveDto } from '../leave/dto/apply-leave.dto';
import { SaveRequestEmailTemplateDto } from './dto/request-email.dto';
import {
  renderEmailTemplate,
  validateEmailTemplate,
  REQUEST_EMAIL_PLACEHOLDERS,
} from './request-email-placeholders';
import { applicationDuration } from '../../shared/request-duration.util';

const valid = {
  name: ' Test ',
  recipients: [' HR@Example.com ', 'manager@example.com'],
  subjectTemplate: '{{employee_name}} leave',
  bodyTemplate: '{{reason}}',
  enabled: true,
  isDefault: false,
};

describe('Application email validation and rendering', () => {
  it.each(REQUEST_EMAIL_PLACEHOLDERS)(
    'renders supported placeholder %s',
    (placeholder) => {
      const template = `Field: {{ ${placeholder} }}`;
      expect(() => validateEmailTemplate(template)).not.toThrow();
      expect(
        renderEmailTemplate(template, {
          [placeholder]: '<literal> $& {{reason}}',
        }),
      ).toBe('Field: <literal> $& {{reason}}');
    },
  );
  it('accepts camel case aliases without executing user supplied expressions', () => {
    validateEmailTemplate('{{employeeName}}: {{startDate}}');
    expect(
      renderEmailTemplate('{{employeeName}}: {{startDate}}', {
        employee_name: 'Alex',
        start_date: '2026-12-01',
      }),
    ).toBe('Alex: 2026-12-01');
  });
  it.each([
    '{{unknown}}',
    '{{employee_name',
    '{{reason()}}',
    '{{ employee.name }}',
    '  ',
  ])('rejects malformed or unknown template %s', (template) => {
    expect(() => validateEmailTemplate(template)).toThrow();
  });
  it('normalizes recipient addresses and template names', async () => {
    const dto = plainToInstance(SaveRequestEmailTemplateDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Test');
    expect(dto.recipients).toEqual(['hr@example.com', 'manager@example.com']);
  });
  it.each([
    [],
    ['invalid'],
    ['a@example.com', ' A@EXAMPLE.COM '],
    Array.from({ length: 21 }, (_, i) => `${i}@example.com`),
    'hr@example.com',
    [null],
  ])('rejects invalid recipient list %j', async (recipients) => {
    expect(
      (
        await validate(
          plainToInstance(SaveRequestEmailTemplateDto, {
            ...valid,
            recipients,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each(['Injected\r\nBcc: attacker@example.com', '', 'x'.repeat(201)])(
    'rejects invalid subject %j',
    async (subjectTemplate) => {
      expect(
        (
          await validate(
            plainToInstance(SaveRequestEmailTemplateDto, {
              ...valid,
              subjectTemplate,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('preserves legacy apply payloads and rejects null and tampered draft recipients', async () => {
    const fields = {
      leaveTypeId: 'd7ec8b41-592e-47ac-94a8-dd13c0130001',
      startDate: '2026-12-01',
      endDate: '2026-12-01',
      reason: 'Test',
    };
    const options = { whitelist: true, forbidNonWhitelisted: true };
    expect(
      await validate(plainToInstance(ApplyLeaveDto, fields), options),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(ApplyLeaveDto, { ...fields, emailDraft: null }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(ApplyLeaveDto, {
            ...fields,
            emailDraft: {
              templateId: fields.leaveTypeId,
              fingerprint: 'a'.repeat(64),
              subject: 'Test',
              body: 'Body',
              recipients: ['attacker@example.com'],
            },
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    ['leave', '2026-12-01', '2026-12-01', 0.5, 0.5],
    ['leave', '2026-12-04', '2026-12-07', 1, 2],
    ['wfh', '2026-12-05', '2026-12-06', undefined, 1],
    ['wfh', '2026-12-01', '2026-12-03', undefined, 3],
  ] as const)(
    'uses existing %s duration rules',
    (kind, start, end, duration, expected) => {
      expect(
        applicationDuration(kind, start, end, duration as number | undefined),
      ).toBe(expected);
    },
  );
});
