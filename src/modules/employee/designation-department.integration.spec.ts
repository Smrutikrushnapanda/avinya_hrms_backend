import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { readFileSync } from 'fs';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { Employee } from './entities/employee.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { User } from '../auth-core/entities/user.entity';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { DepartmentController } from './department.controller';
import { DesignationController } from './designation.controller';
import { DepartmentService } from './department.service';
import { DesignationService } from './designation.service';

const url = process.env.ASSIGN_WORK_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;

integration('Designation department link and production SQL', () => {
  let db: DataSource;
  let app: INestApplication<App>;
  const schema = `designation_departments_${Date.now()}`;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const legacyId = randomUUID();
  let department: Department;
  let otherDepartment: Department;
  let designationId: string;

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
    await db.getRepository(Organization).save([
      { id: org, organizationName: schema },
      { id: otherOrg, organizationName: `${schema}_other` },
    ]);
    department = await db
      .getRepository(Department)
      .save({ organizationId: org, name: 'Engineering', code: 'ENG' });
    otherDepartment = await db
      .getRepository(Department)
      .save({ organizationId: otherOrg, name: 'Foreign', code: 'FOREIGN' });
    await db
      .getRepository(Designation)
      .save({ id: legacyId, organizationId: org, name: 'Legacy', code: 'OLD' });
    const fixture = await Test.createTestingModule({
      controllers: [DepartmentController, DesignationController],
      providers: [
        DepartmentService,
        DesignationService,
        ...[Department, Designation, Employee].map((entity) => ({
          provide: getRepositoryToken(entity),
          useValue: db.getRepository(entity),
        })),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user?: unknown }>();
          if (!req.headers['x-test-role']) return false;
          req.user = {
            organizationId: req.headers['x-test-org'] || org,
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
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('applies production SQL twice to old schema without changing existing designations', async () => {
    await db.query(
      `ALTER TABLE "${schema}".designations DROP COLUMN department_id CASCADE`,
    );
    const sql = readFileSync(
      path.resolve(__dirname, '../../../sql/designation-departments.sql'),
      'utf8',
    ).replaceAll('public.', `"${schema}".`);
    await db.query(sql);
    await db.query(sql);
    const legacy = await db
      .getRepository(Designation)
      .findOneByOrFail({ id: legacyId });
    expect(legacy.departmentId).toBeNull();
    expect(legacy.name).toBe('Legacy');
    const runner = db.createQueryRunner();
    try {
      const table = await runner.getTable(`${schema}.designations`);
      expect(table.findColumnByName('department_id')).toEqual(
        expect.objectContaining({ type: 'uuid', isNullable: true }),
      );
      expect(table.foreignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'FK_designations_department_id',
            onDelete: 'RESTRICT',
          }),
        ]),
      );
    } finally {
      await runner.release();
    }
  });

  it('requires department and rejects invalid, null and cross-tenant department IDs', async () => {
    for (const departmentId of [
      undefined,
      null,
      '',
      'invalid',
      randomUUID(),
      otherDepartment.id,
    ]) {
      await request(app.getHttpServer())
        .post('/designations')
        .set('x-test-role', 'ADMIN')
        .send({ organizationId: org, name: 'Developer', departmentId })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/designations')
      .set('x-test-role', 'ADMIN')
      .send({ name: '  ', departmentId: department.id })
      .expect(400);
  });

  it('creates, lists and filters designations with department relation', async () => {
    const created = await request(app.getHttpServer())
      .post('/designations')
      .set('x-test-role', 'ADMIN')
      .send({
        organizationId: org,
        name: ' Developer ',
        code: ' DEV ',
        departmentId: department.id,
      })
      .expect(201);
    const body = created.body as { data: Designation };
    designationId = body.data.id;
    expect(body.data).toEqual(
      expect.objectContaining({
        departmentId: department.id,
        organizationId: org,
        name: 'Developer',
        code: 'DEV',
      }),
    );
    const list = await request(app.getHttpServer())
      .get(`/designations?organizationId=${org}&departmentId=${department.id}`)
      .set('x-test-role', 'EMPLOYEE')
      .expect(200);
    const listed = (list.body as { data: Designation[] }).data;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(designationId);
    expect(listed[0].department).toMatchObject({
      id: department.id,
      name: 'Engineering',
    });
    const all = await request(app.getHttpServer())
      .get('/designations')
      .set('x-test-role', 'ADMIN')
      .expect(200);
    expect(
      (all.body as { data: Designation[] }).data.some(
        (item) => item.id === legacyId,
      ),
    ).toBe(true);
  });

  it('edits legacy rows without requiring backfill and can explicitly link them', async () => {
    await request(app.getHttpServer())
      .put(`/designations/${legacyId}`)
      .set('x-test-role', 'HR')
      .send({ name: 'Legacy renamed', organizationId: org })
      .expect(200);
    expect(
      (await db.getRepository(Designation).findOneByOrFail({ id: legacyId }))
        .departmentId,
    ).toBeNull();
    await request(app.getHttpServer())
      .put(`/designations/${legacyId}`)
      .set('x-test-role', 'HR')
      .send({ departmentId: department.id })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/designations/${legacyId}`)
      .set('x-test-role', 'ADMIN')
      .send({ departmentId: null })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/designations/${legacyId}`)
      .set('x-test-role', 'ADMIN')
      .send({ departmentId: otherDepartment.id })
      .expect(400);
  });

  it('isolates reads and writes by organization and limits mutations to management', async () => {
    for (const route of ['departments', 'designations']) {
      await request(app.getHttpServer())
        .get(`/${route}?organizationId=${otherOrg}`)
        .set('x-test-role', 'ADMIN')
        .expect(403);
      await request(app.getHttpServer())
        .post(`/${route}`)
        .set('x-test-role', 'EMPLOYEE')
        .send({})
        .expect(403);
      await request(app.getHttpServer()).get(`/${route}`).expect(403);
      const id = route === 'departments' ? department.id : designationId;
      await request(app.getHttpServer())
        .put(`/${route}/${id}`)
        .set('x-test-role', 'ADMIN')
        .set('x-test-org', otherOrg)
        .send({ name: 'Foreign edit' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/${route}/${id}`)
        .set('x-test-role', 'ADMIN')
        .set('x-test-org', otherOrg)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/${route}`)
        .set('x-test-role', 'ADMIN')
        .send({
          organizationId: otherOrg,
          name: 'Foreign write',
          departmentId: route === 'designations' ? department.id : undefined,
        })
        .expect(403);
    }
  });

  it('protects linked departments and employee designations, allowing unused records to be deleted', async () => {
    await request(app.getHttpServer())
      .delete(`/departments/${department.id}`)
      .set('x-test-role', 'ADMIN')
      .expect(409);
    await expect(
      db.getRepository(Department).delete(department.id),
    ).rejects.toMatchObject({ driverError: { code: '23503' } });
    const user = await db.getRepository(User).save({
      userName: schema,
      email: `${schema}@example.test`,
      password: 'unused-test-hash',
      firstName: 'Test',
      lastName: 'Employee',
      organizationId: org,
    });
    const employee = await db.getRepository(Employee).save({
      organizationId: org,
      userId: user.id,
      employeeCode: 'LINK-TEST',
      firstName: 'Test',
      dateOfJoining: new Date(),
      departmentId: department.id,
      designationId,
    });
    await request(app.getHttpServer())
      .delete(`/designations/${designationId}`)
      .set('x-test-role', 'ADMIN')
      .expect(409);
    await db.getRepository(Employee).delete(employee.id);
    await request(app.getHttpServer())
      .delete(`/designations/${designationId}`)
      .set('x-test-role', 'ADMIN')
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/designations/${legacyId}`)
      .set('x-test-role', 'ADMIN')
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/departments/${department.id}`)
      .set('x-test-role', 'ADMIN')
      .expect(200);
  });
});
