import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

async function violations(dto: Partial<CreateEmployeeDto>) {
  const instance = plainToInstance(CreateEmployeeDto, dto);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const found: Record<string, string[]> = {};
  for (const err of errors) {
    found[err.property] = Object.keys(err.constraints || {});
  }
  return found;
}

describe('CreateEmployeeDto PAN / Aadhaar validation', () => {
  it('accepts a valid uppercase PAN', async () => {
    const errors = await violations({
      panNumber: 'ABCDE1234F',
      organizationId: '00000000-0000-4000-8000-000000000000',
      employeeCode: 'EMP001',
      firstName: 'Priya',
      workEmail: 'priya@example.com',
    });
    expect(errors.panNumber).toBeUndefined();
  });

  it('uppercases lowercase PAN input and passes validation', async () => {
    const errors = await violations({ panNumber: 'abcde1234f' });
    expect(errors.panNumber).toBeUndefined();
  });

  it('rejects malformed PAN', async () => {
    const errors = await violations({ panNumber: 'ABCDE12345' });
    expect(errors.panNumber).toContain('matches');
  });

  it('rejects PAN shorter than 10 characters', async () => {
    const errors = await violations({ panNumber: 'ABC1234' });
    expect(errors.panNumber).toContain('matches');
  });

  it('accepts a valid 12-digit Aadhaar', async () => {
    const errors = await violations({ aadhaarNumber: '123456789012' });
    expect(errors.aadhaarNumber).toBeUndefined();
  });

  it('rejects non-digit Aadhaar', async () => {
    const errors = await violations({ aadhaarNumber: '12345678901A' });
    expect(errors.aadhaarNumber).toContain('matches');
  });

  it('rejects Aadhaar with fewer than 12 digits', async () => {
    const errors = await violations({ aadhaarNumber: '12345' });
    expect(errors.aadhaarNumber).toContain('matches');
  });

  it('allows PAN / Aadhaar to be omitted', async () => {
    const errors = await violations({});
    expect(errors.panNumber).toBeUndefined();
    expect(errors.aadhaarNumber).toBeUndefined();
  });
});