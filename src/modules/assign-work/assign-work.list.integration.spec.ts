import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { AssignWorkController } from './assign-work.controller';
import { AssignWorkService, WorkAssignment } from './assign-work.service';
import { JwtStrategy } from '../auth-core/utils/jwt.strategy';
import { User } from '../auth-core/entities/user.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { ProjectTask } from '../clients/entities/project-task.entity';
import { ProjectIssue } from '../project/entities/project-issue.entity';
import { ClientProject } from '../clients/entities/project.entity';
import { Project } from '../project/entities/project.entity';
import { AddAssignWorkCompletedPointIndexes1800000000001 } from '../../migrations/1800000000001-AddAssignWorkCompletedPointIndexes';

const databaseUrl = process.env.ASSIGN_WORK_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('Assign Work PostgreSQL + JWT HTTP regression', () => {
  let db: DataSource;
  let app: INestApplication<App>;
  let service: AssignWorkService;
  let jwt: JwtService;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const me: string = randomUUID();
  const colleague: string = randomUUID();
  const outsider: string = randomUUID();
  const empty: string = randomUUID();
  const ids: Record<string, string> = {};
  const schema = `assign_work_${Date.now()}`;
  const originalSecret = process.env.JWT_SECRET_KEY;
  const secret = 'isolated-assign-work-regression-secret';

  beforeAll(async () => {
    const url = new URL(databaseUrl);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('Integration tests require isolated local PostgreSQL');
    }
    process.env.JWT_SECRET_KEY = secret;
    db = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [path.join(__dirname, '/../**/entities/*.entity.ts')],
      synchronize: false,
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    service = Object.create(AssignWorkService.prototype) as AssignWorkService;
    Object.assign(service, {
      taskRepo: db.getRepository(ProjectTask),
      issueRepo: db.getRepository(ProjectIssue),
      clientProjectRepo: db.getRepository(ClientProject),
      internalProjectRepo: db.getRepository(Project),
      logger: new Logger('AssignWorkIntegration'),
    });
    // Keep real Passport/JWT validation; only identity-store fixtures are mocked.
    const fixture = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [AssignWorkController],
      providers: [
        JwtStrategy,
        { provide: AssignWorkService, useValue: service },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: ({ where }: { where: { id: string } }) => {
              if (![me, colleague, outsider, empty].includes(where.id))
                return null;
              return {
                id: where.id,
                isActive: true,
                organizationId: where.id === outsider ? otherOrg : org,
                userRoles: [],
              };
            },
          },
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: { findOne: () => ({ isActive: true }) },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = fixture.get(JwtService);
    for (const [table, title, to, by] of [
      ['project_tasks', 'title', 'assigned_to_user_id', 'assigned_by_user_id'],
      [
        'project_issues',
        'issue_title',
        'assignee_user_id',
        'created_by_user_id',
      ],
    ]) {
      // Insert fixtures without FKs to unrelated users; those relationships are nullable in responses.
      const keys = await db.query<{ conname: string }[]>(
        `SELECT conname FROM pg_constraint WHERE conrelid = '"${schema}"."${table}"'::regclass AND contype = 'f'`,
      );
      for (const row of keys)
        await db.query(
          `ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${row.conname}"`,
        );
      for (const [name, date, tenant, assignee, assigner] of [
        ['first', '2026-10-01T00:00:00Z', org, me, colleague],
        ['last', '2026-10-31T23:59:59.999Z', org, me, me],
        ['next', '2026-11-01T00:00:00Z', org, me, me],
        ['previous', '2026-09-30T23:59:59.999Z', org, me, me],
        ['colleague', '2026-10-02T00:00:00Z', org, colleague, colleague],
        ['foreign', '2026-10-03T00:00:00Z', otherOrg, me, me],
        ['nullable', '2026-10-04T00:00:00Z', org, null, me],
      ]) {
        const id = randomUUID();
        ids[`${table}-${name}`] = id;
        await db.query(
          `INSERT INTO "${schema}"."${table}" (id, organization_id, ${title}, ${to}, ${by}, created_at${table === 'project_issues' ? ', page_name' : ''}) VALUES ($1,$2,$3,$4,$5,$6${table === 'project_issues' ? ", 'Work'" : ''})`,
          [id, tenant, name, assignee, assigner, date],
        );
      }
    }
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
    if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = originalSecret;
  });

  function get(route: string, user = me, tenant = org) {
    return request(app.getHttpServer())
      .get(`/assign-work/${route}`)
      .auth(jwt.sign({ userId: user, organizationId: tenant }), {
        type: 'bearer',
      });
  }

  it('reproduces missing-column 500; additive migration fixes both tables and reruns safely', async () => {
    const logs = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    for (const table of ['project_tasks', 'project_issues'])
      await db.query(
        `ALTER TABLE "${schema}"."${table}" DROP COLUMN completed_point_indexes`,
      );
    for (const route of [
      'my',
      'assigned-by-me',
      'my?month=10&year=2026',
      'assigned-by-me?month=10&year=2026',
    ]) {
      const response = await get(route).expect(500);
      expect((response.body as { message: string }).message).toBe(
        'Unable to load work assignments',
      );
      expect(JSON.stringify(response.body)).not.toContain('SELECT');
    }
    expect(
      logs.mock.calls.some((call) =>
        String(call[1]).includes('completed_point_indexes'),
      ),
    ).toBe(true);
    const runner = db.createQueryRunner();
    try {
      const migration = new AddAssignWorkCompletedPointIndexes1800000000001();
      await migration.up(runner);
      for (const table of ['project_tasks', 'project_issues']) {
        expect(
          await runner.hasColumn(
            `${schema}.${table}`,
            'completed_point_indexes',
          ),
        ).toBe(true);
      }
      await migration.up(runner);
    } finally {
      await runner.release();
      logs.mockRestore();
    }
  });

  it.each(['my', 'assigned-by-me'])(
    '%s returns scoped records, null relations and empty collections',
    async (route) => {
      const response = await get(route).expect(200);
      expect((response.body as WorkAssignment[]).length).toBeGreaterThan(0);
      for (const row of response.body as WorkAssignment[]) {
        expect(
          row[route === 'my' ? 'assignedToUserId' : 'assignedByUserId'],
        ).toBe(me);
        expect(row.assignedToUser).toBeNull();
        expect(row.completedPointIndexes).toBeNull();
        expect(row.projectName).toBe('');
        expect(row.assignedAt).toBe(row.createdAt);
        expect(['foreign', 'colleague']).not.toContain(row.title);
      }
      expect(
        new Set(
          (response.body as WorkAssignment[]).map(
            (row: { id: string }) => row.id,
          ),
        ).size,
      ).toBe((response.body as WorkAssignment[]).length);
      expect((await get(route, empty).expect(200)).body).toEqual([]);
      expect((await get(route, outsider, otherOrg).expect(200)).body).toEqual(
        [],
      );
    },
  );

  it.each(['my', 'assigned-by-me'])(
    '%s includes complete October using exclusive November boundary',
    async (route) => {
      const response = await get(`${route}?month=10&year=2026`).expect(200);
      const titles = (response.body as WorkAssignment[]).map(
        (row: { title: string }) => row.title,
      );
      expect(titles).toContain('last');
      for (const type of ['client', 'internal']) {
        const typedTitles = (response.body as WorkAssignment[])
          .filter((row) => row.type === type)
          .map((row) => row.title);
        expect(typedTitles).toContain('last');
        if (route === 'my') expect(typedTitles).toContain('first');
        expect(typedTitles).not.toContain('next');
        expect(typedTitles).not.toContain('previous');
      }
      expect(titles).not.toContain('next');
      expect(titles).not.toContain('previous');
      expect(
        (await get(`${route}?month=10&year=2026`, empty).expect(200)).body,
      ).toEqual([]);
    },
  );

  it.each(['my', 'assigned-by-me'])(
    '%s rejects invalid filters and unauthenticated requests',
    async (route) => {
      for (const query of [
        'month=0&year=2026',
        'month=13&year=2026',
        'month=10',
        'year=2026',
        'month=abc&year=2026',
        'month=10&year=abc',
        'month=10&year=0',
      ])
        await get(`${route}?${query}`).expect(400);
      await request(app.getHttpServer())
        .get(`/assign-work/${route}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/assign-work/${route}`)
        .auth('invalid', { type: 'bearer' })
        .expect(401);
      await request(app.getHttpServer())
        .get(`/assign-work/${route}`)
        .auth(
          jwt.sign({ userId: me, organizationId: org }, { expiresIn: -1 }),
          { type: 'bearer' },
        )
        .expect(401);
      await get(route, me, otherOrg).expect(401);
      const response = await get(
        `${route}?userId=${colleague}&organizationId=${otherOrg}`,
      ).expect(200);
      expect(
        (response.body as WorkAssignment[]).some((row: { title: string }) =>
          ['colleague', 'foreign'].includes(row.title),
        ),
      ).toBe(false);
    },
  );
  it('scopes legacy project-backed tasks and tolerates non-UUID legacy project tenants', async () => {
    const projectId = randomUUID();
    const legacyId = randomUUID();
    await db.query(
      `INSERT INTO "${schema}".client_projects (id, organization_id, project_name) VALUES ($1,$2,'Legacy project'),($3,'legacy-invalid','Old project')`,
      [projectId, org, legacyId],
    );
    for (const [title, tenant, project] of [
      ['project-backed', null, projectId],
      ['conflicting-tenant', otherOrg, projectId],
      ['invalid-tenant', null, legacyId],
    ]) {
      await db.query(
        `INSERT INTO "${schema}".project_tasks (id, organization_id, project_id, title, assigned_to_user_id, assigned_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$5,'2026-10-10')`,
        [randomUUID(), tenant, project, title, me],
      );
    }
    for (const route of ['my', 'assigned-by-me']) {
      const rows = (await get(`${route}?month=10&year=2026`).expect(200))
        .body as WorkAssignment[];
      expect(
        rows.find((row) => row.title === 'project-backed')?.projectName,
      ).toBe('Legacy project');
      expect(
        rows.some((row) =>
          ['conflicting-tenant', 'invalid-tenant'].includes(row.title),
        ),
      ).toBe(false);
    }
  });
  it('records targeted migration once and verifies complete task schema before restart', async () => {
    for (const [command, expected] of [
      ['migrate:assign-work-checklist', 'Assign Work migrations applied: 1'],
      ['migrate:assign-work-checklist', 'Assign Work migrations applied: 0'],
      ['check:assign-work-schema', 'Assign Work schema verified'],
    ]) {
      const result = spawnSync('npm', ['run', command], {
        cwd: path.resolve(__dirname, '../../..'),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DB_SCHEMA: schema,
          DB_SSL: 'false',
          NODE_ENV: 'production',
          DB_SYNCHRONIZE: 'false',
        },
        encoding: 'utf8',
        timeout: 45000,
      });
      expect({
        status: result.status,
        stderr: result.stderr,
        stdout: result.stdout,
      }).toEqual(expect.objectContaining({ status: 0 }));
      expect(result.stdout).toContain(expected);
      expect(result.stdout).toContain(`schema=${schema}`);
    }
    const history = await db.query<{ name: string }[]>(
      `SELECT name FROM "${schema}".migrations`,
    );
    expect(history).toEqual([
      { name: 'AddAssignWorkCompletedPointIndexes1800000000001' },
    ]);
    await expect(
      new AddAssignWorkCompletedPointIndexes1800000000001().down(),
    ).rejects.toThrow('without dropping');
  }, 120000);

  it('persists checklist progress, reports, image URL and completion/reopening timestamps', async () => {
    for (const [type, table] of [
      ['client', 'project_tasks'],
      ['internal', 'project_issues'],
    ]) {
      const id = ids[`${table}-last`];
      await db.query(
        `UPDATE "${schema}"."${table}" SET description=$1, image_url=$2 WHERE id=$3`,
        ['- First step\n- Second step', 'https://example.test/work.png', id],
      );
      const update = (indexes: number[]) =>
        request(app.getHttpServer())
          .put(`/assign-work/${id}/progress`)
          .auth(jwt.sign({ userId: me, organizationId: org }), {
            type: 'bearer',
          })
          .send({
            source: type,
            completedPointIndexes: indexes,
            workReport: 'Completed review',
          });
      await update([0]).expect(200);
      let rows = (await get('my?month=10&year=2026').expect(200))
        .body as WorkAssignment[];
      expect(rows.find((row) => row.id === id)).toEqual(
        expect.objectContaining({
          progressPercent: 50,
          completedPointIndexes: [0],
          workReport: 'Completed review',
          imageUrl: 'https://example.test/work.png',
          completedAt: null,
        }),
      );
      await update([0, 1]).expect(200);
      rows = (await get('assigned-by-me?month=10&year=2026').expect(200))
        .body as WorkAssignment[];
      expect(rows.find((row) => row.id === id)).toEqual(
        expect.objectContaining({
          progressPercent: 100,
          completedPointIndexes: [0, 1],
          status: type === 'client' ? 'completed' : 'resolved',
        }),
      );
      expect(rows.find((row) => row.id === id)?.completedAt).toEqual(
        expect.any(String),
      );
      await update([1]).expect(200);
      const result = await db.query<
        {
          completed_point_indexes: number[];
          work_report: string;
          image_url: string;
          completed: Date | null;
        }[]
      >(
        `SELECT completed_point_indexes, work_report, image_url, ${type === 'client' ? 'completed_at' : 'resolved_at'} AS completed FROM "${schema}"."${table}" WHERE id=$1`,
        [id],
      );
      expect(result[0]).toEqual({
        completed_point_indexes: [1],
        work_report: 'Completed review',
        image_url: 'https://example.test/work.png',
        completed: null,
      });
    }
  });

  it('creates new assignment and retrieves its image and initial checklist state', async () => {
    Object.assign(service, {
      employeeRepo: {
        find: () => Promise.resolve([{ id: randomUUID(), userId: colleague }]),
      },
      notifyAssignee: jest.fn().mockResolvedValue(undefined),
    });
    const response = await request(app.getHttpServer())
      .post('/assign-work')
      .auth(jwt.sign({ userId: me, organizationId: org }), { type: 'bearer' })
      .send({
        title: 'New assignment',
        description: '- First step\n- Second step',
        assignedToUserId: colleague,
        imageUrl: 'https://example.test/new.png',
      })
      .expect(201);
    const created = response.body as ProjectTask[];
    expect(created).toHaveLength(1);
    const rows = (await get('my', colleague).expect(200))
      .body as WorkAssignment[];
    expect(rows.find((row) => row.id === created[0].id)).toEqual(
      expect.objectContaining({
        title: 'New assignment',
        completedPointIndexes: [],
        progressPercent: 0,
        imageUrl: 'https://example.test/new.png',
      }),
    );
  });
});
