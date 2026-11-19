import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { CreateEmployeeDto } from './create-employee.dto';
import { UpdateEmployeeDto } from './update-employee.dto';

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

describe.each([CreateEmployeeDto, UpdateEmployeeDto])(
  '%s document validation',
  (metatype) => {
    const documents = {
      bankProofUrl: 'https://example.com/bank.pdf',
      educationCertificateUrl: 'https://example.com/education.pdf',
      experienceLetterUrl: 'https://example.com/experience.pdf',
    };
    const requiredFields = {
      organizationId: '00000000-0000-4000-8000-000000000000',
      employeeCode: 'EMP001',
      firstName: 'Priya',
      lastName: 'Sharma',
      workEmail: 'priya@example.com',
      dateOfJoining: '2026-11-19',
      loginPassword: 'password123',
    };

    const validatePayload = (fields: Record<string, unknown>) => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      return pipe.transform(
        {
          ...(metatype === CreateEmployeeDto ? requiredFields : {}),
          ...fields,
        },
        { type: 'body', metatype },
      );
    };

    it('accepts and preserves uploaded document URLs', async () => {
      await expect(validatePayload(documents)).resolves.toMatchObject(
        documents,
      );
    });

    it.each(Object.keys(documents))('rejects non-string %s', async (field) => {
      await expect(validatePayload({ [field]: 123 })).rejects.toThrow(
        'Bad Request Exception',
      );
    });

    it('allows optional documents to be omitted', async () => {
      await expect(validatePayload({})).resolves.toBeInstanceOf(metatype);
    });

    it('allows documents to be cleared', async () => {
      const cleared = Object.fromEntries(
        Object.keys(documents).map((field) => [field, null]),
      );
      await expect(validatePayload(cleared)).resolves.toMatchObject(cleared);
    });

    it('continues rejecting unknown properties', async () => {
      await expect(
        validatePayload({ unsupportedDocument: 'file.pdf' }),
      ).rejects.toThrow('Bad Request Exception');
    });
  },
);
