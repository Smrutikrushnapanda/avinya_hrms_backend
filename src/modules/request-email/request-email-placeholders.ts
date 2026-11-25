import { BadRequestException } from '@nestjs/common';

export const REQUEST_EMAIL_PLACEHOLDERS = [
  'employee_name',
  'employee_code',
  'employee_email',
  'department',
  'designation',
  'leave_type',
  'request_type',
  'start_date',
  'end_date',
  'duration',
  'total_days',
  'reason',
  'organization_name',
  'application_date',
  'manager_name',
] as const;
const normalized = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
const placeholderPattern = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;

export function validateEmailTemplate(value: string) {
  if (!value.trim())
    throw new BadRequestException('Email subject and body cannot be blank');
  const remaining = value.replace(
    placeholderPattern,
    (_match: string, key: string) => {
      if (
        !(REQUEST_EMAIL_PLACEHOLDERS as readonly string[]).includes(
          normalized(key),
        )
      )
        throw new BadRequestException(`Unknown email placeholder: ${key}`);
      return '';
    },
  );
  if (remaining.includes('{{') || remaining.includes('}}'))
    throw new BadRequestException('Invalid email placeholder syntax');
}

export function renderEmailTemplate(
  value: string,
  context: Record<string, string>,
) {
  return value.replace(
    placeholderPattern,
    (_match: string, key: string) =>
      context[normalized(key)] ?? 'Not specified',
  );
}
