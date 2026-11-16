import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { EmployeeService } from './employee.service';
import { Employee } from './entities/employee.entity';
import { User } from '../auth-core/entities/user.entity';
import { Organization } from '../auth-core/entities/organization.entity';
import { UsersService } from '../auth-core/services/users.service';
import { UserRole } from '../auth-core/entities/user-role.entity';
import { AssignWorkService } from '../assign-work/assign-work.service';
import { ClientProject } from '../clients/entities/project.entity';
import { Project } from '../project/entities/project.entity';
import { employeeListCacheKey } from '../../shared/active-employees.util';
import { ProjectService } from '../project/project.service';
import { ProjectsService } from '../clients/projects.service';
import { ProjectMember } from '../project/entities/project-member.entity';
import { ClientProjectMember } from '../clients/entities/client-project-member.entity';

const url = process.env.ASSIGN_WORK_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;

integration('Active employees across working lists and selectors', () => {
  let db: DataSource;
  let service: EmployeeService;
  let users: UsersService;
  let assignments: AssignWorkService;
  const schema = `active_employees_${Date.now()}`;
  const organizationId = randomUUID();
  const otherOrg = randomUUID();
  const fixtures: Record<string, Employee> = {};
  const cache = new Map<string, unknown>();
  const cacheManager = {
    get: (key: string) => Promise.resolve(cache.get(key)),
    set: (key: string, value: unknown) => {
      cache.set(key, value);
      return Promise.resolve(value);
    },
    del: (key: string) => Promise.resolve(cache.delete(key)),
  };
  const actor = {
    userId: randomUUID(),
    organizationId,
    roles: [{ roleName: 'ADMIN' }],
  };

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw new Error('Tests require isolated local PostgreSQL');
    db = new DataSource({
      type: 'postgres',
      url,
      schema,
      synchronize: false,
      entities: [path.join(__dirname, '/../**/entities/*.entity.ts')],
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    await db.getRepository(Organization).save([
      { id: organizationId, organizationName: `Active ${schema}` },
      { id: otherOrg, organizationName: `Other ${schema}` },
    ]);
    for (const [name, status, active, org] of [
      ['active', 'active', true, organizationId],
      ['inactive', 'inactive', true, organizationId],
      ['disabled', 'active', false, organizationId],
      ['bothInactive', 'inactive', false, organizationId],
      ['terminated', 'terminated', false, organizationId],
      ['outsider', 'active', true, otherOrg],
    ] as const) {
      const user = await db.getRepository(User).save({
        userName: `${schema}-${name}`,
        email: `${schema}-${name}@example.test`,
        password: 'test-only-password-hash',
        firstName: name,
        lastName: 'Employee',
        organizationId: org,
        isActive: active,
      });
      fixtures[name] = await db.getRepository(Employee).save({
        userId: user.id,
        organizationId: org,
        firstName: name,
        lastName: 'Employee',
        employeeCode: randomUUID().slice(0, 20),
        dateOfJoining: new Date('2026-01-01'),
        status,
      });
    }
    service = Object.create(EmployeeService.prototype) as EmployeeService;
    Object.assign(service, {
      employeeRepository: db.getRepository(Employee),
      cacheManager,
      addSignedProfilePhoto: (employee: Employee) => Promise.resolve(employee),
      attachProjectAssignmentsAndManagers: () => Promise.resolve(),
      getUserRolesMap: () => Promise.resolve(new Map()),
    });
    users = Object.create(UsersService.prototype) as UsersService;
    Object.assign(users, {
      userRepository: db.getRepository(User),
      userRoleRepository: db.getRepository(UserRole),
      employeeRepository: db.getRepository(Employee),
      cacheManager,
    });
    assignments = Object.create(
      AssignWorkService.prototype,
    ) as AssignWorkService;
    Object.assign(assignments, {
      employeeRepo: db.getRepository(Employee),
      clientProjectRepo: db.getRepository(ClientProject),
      internalProjectRepo: db.getRepository(Project),
    });
  }, 60000);

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  const filters = { page: 1, limit: 20, sortBy: 'firstName', sortOrder: 'asc' };

  it.each([undefined, 'active', 'all'])(
    'directory %s returns only active employees with active logins',
    async (status) => {
      const rows = (await service.findAll(
        organizationId,
        status,
      )) as Employee[];
      expect(rows.map((row) => row.id)).toEqual([fixtures.active.id]);
    },
  );

  it.each([undefined, 'active', 'all'])(
    'paginated management list %s uses the same active rules',
    async (status) => {
      const result = await service.findAllWithFilters(organizationId, {
        ...filters,
        status,
      });
      expect((result.employees as Employee[]).map((row) => row.id)).toEqual([
        fixtures.active.id,
      ]);
      expect(result.pagination.total).toBe(1);
    },
  );

  it('selector, hierarchy, manager options and assignment options exclude inactive and disabled employees', async () => {
    const selector = await service.getEmployeeSelector(organizationId, {});
    expect(
      selector.every(
        (employee) =>
          employee.status === 'active' && employee.user?.isActive === true,
      ),
    ).toBe(true);
    const options = await assignments.getOptions(organizationId);
    expect(options.employees).toEqual([
      expect.objectContaining({
        userId: fixtures.active.userId,
        status: 'active',
        isActive: true,
      }),
    ]);
    expect(
      await service.getEmployeeSearchSuggestions(organizationId, 'disabled'),
    ).toEqual([]);
    expect(
      (await service.getEmployeeSelector(organizationId, {})).map(
        (row) => row.id,
      ),
    ).toEqual([fixtures.active.id]);
    expect(
      ((await service.findManagers(organizationId)) as Employee[]).map(
        (row) => row.id,
      ),
    ).toEqual([fixtures.active.id]);
    expect(
      (await assignments.getOptions(organizationId)).employees.map(
        (row) => row.userId,
      ),
    ).toEqual([fixtures.active.userId]);
    const hierarchy = await service.getEmployeeHierarchy(organizationId);
    expect(hierarchy).toBeDefined();
    expect(JSON.stringify(hierarchy)).not.toContain(fixtures.disabled.id);
    expect(JSON.stringify(hierarchy)).not.toContain(fixtures.inactive.id);
  });

  it('refreshes assignment options immediately after either employment or login deactivation', async () => {
    const employee = fixtures.active;
    expect(
      (await assignments.getOptions(organizationId)).employees,
    ).toHaveLength(1);
    try {
      await db
        .getRepository(Employee)
        .update(employee.id, { status: 'inactive' });
      expect((await assignments.getOptions(organizationId)).employees).toEqual(
        [],
      );
      await db
        .getRepository(Employee)
        .update(employee.id, { status: 'active' });
      await db.getRepository(User).update(employee.userId, { isActive: false });
      expect((await assignments.getOptions(organizationId)).employees).toEqual(
        [],
      );
    } finally {
      await db
        .getRepository(Employee)
        .update(employee.id, { status: 'active' });
      await db.getRepository(User).update(employee.userId, { isActive: true });
    }
  });

  it('rejects stale inactive/disabled recipient IDs submitted directly to assignment API', async () => {
    for (const employee of [
      fixtures.inactive,
      fixtures.disabled,
      fixtures.bothInactive,
      fixtures.terminated,
      fixtures.outsider,
    ]) {
      await expect(
        assignments.create(actor.userId, organizationId, {
          title: 'Stale recipient',
          description: 'Work from an old employee list',
          assignedToUserIds: [employee.userId],
        }),
      ).rejects.toThrow(
        'One or more assignees are inactive or do not belong to this organization',
      );
    }
  });

  it('inactive admin archive includes disabled logins without removing historical records', async () => {
    const rows = (await service.findAll(
      organizationId,
      'inactive',
    )) as Employee[];
    expect(new Set(rows.map((row) => row.id))).toEqual(
      new Set([
        fixtures.inactive.id,
        fixtures.disabled.id,
        fixtures.bothInactive.id,
      ]),
    );
    expect(await db.getRepository(Employee).count()).toBe(6);
  });

  it('project pickers and teams exclude inactive/disabled employees while preserving memberships', async () => {
    const employeeRepo = db.getRepository(Employee);
    const internal = Object.create(ProjectService.prototype) as ProjectService;
    Object.assign(internal, {
      employeeRepo,
      projectRepo: db.getRepository(Project),
      memberRepo: db.getRepository(ProjectMember),
    });
    const client = Object.create(ProjectsService.prototype) as ProjectsService;
    Object.assign(client, {
      employeeRepo,
      projectRepo: db.getRepository(ClientProject),
      memberRepo: db.getRepository(ClientProjectMember),
    });
    const project = await db
      .getRepository(Project)
      .save({ organizationId, name: 'Active team' });
    const clientProject = await db.getRepository(ClientProject).save({
      organizationId,
      projectName: 'Active client team',
      managerId: fixtures.inactive.id,
    });
    for (const employee of Object.values(fixtures)) {
      await db
        .getRepository(ProjectMember)
        .save({ projectId: project.id, userId: employee.userId });
      await db
        .getRepository(ClientProjectMember)
        .save({ projectId: clientProject.id, userId: employee.userId });
    }
    try {
      await employeeRepo.update(
        { organizationId },
        { reportingTo: fixtures.inactive.id },
      );
      expect(
        (await internal.getAllOrgEmployees(organizationId, actor.userId)).map(
          (row) => row.userId,
        ),
      ).toEqual([fixtures.active.userId]);
      expect(
        await internal.getAllOrgEmployees(organizationId, actor.userId, {
          search: 'disabled',
        }),
      ).toEqual([]);
      expect(
        (
          await internal.getMyTeamEmployees(
            fixtures.inactive.userId,
            organizationId,
          )
        ).map((row) => row.userId),
      ).toEqual([fixtures.active.userId]);
      expect(
        (await internal.getProjectEmployees(project.id)).map(
          (row) => row.userId,
        ),
      ).toEqual([fixtures.active.userId]);
      expect(
        (
          await client.getProjectEmployees(clientProject.id, organizationId)
        ).map((row: { userId: string }) => row.userId),
      ).toEqual([fixtures.active.userId]);
      expect(
        await db
          .getRepository(ProjectMember)
          .countBy({ projectId: project.id }),
      ).toBe(6);
      expect(
        await db
          .getRepository(ClientProjectMember)
          .countBy({ projectId: clientProject.id }),
      ).toBe(6);
    } finally {
      await employeeRepo.update({ organizationId }, { reportingTo: null });
      await db.getRepository(Project).delete(project.id);
      await db.getRepository(ClientProject).delete(clientProject.id);
    }
  });

  it('deactivating and reactivating login synchronizes employee status and invalidates warm list and detail caches', async () => {
    const target = fixtures.active;
    await service.findAll(organizationId);
    cache.set(`employee:${target.id}`, target);
    expect(cache.has(employeeListCacheKey(organizationId, 'active'))).toBe(
      true,
    );
    await users.update(target.userId, { isActive: false }, actor);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: target.userId }))
        .isActive,
    ).toBe(false);
    expect(
      (await db.getRepository(Employee).findOneByOrFail({ id: target.id }))
        .status,
    ).toBe('inactive');
    expect(cache.has(employeeListCacheKey(organizationId, 'active'))).toBe(
      false,
    );
    expect(cache.has(`employee:${target.id}`)).toBe(false);
    expect(await service.findAll(organizationId)).toEqual([]);
    expect((await assignments.getOptions(organizationId)).employees).toEqual(
      [],
    );
    await users.update(target.userId, { isActive: true }, actor);
    expect(
      (await db.getRepository(Employee).findOneByOrFail({ id: target.id }))
        .status,
    ).toBe('active');
    expect(
      (await service.getEmployeeSelector(organizationId, {})).map(
        (row) => row.id,
      ),
    ).toEqual([target.id]);
  });

  it('self-service cannot reactivate an account or override employment termination', async () => {
    const target = fixtures.active;
    await users.update(
      target.userId,
      { isActive: false },
      {
        userId: target.userId,
        organizationId,
        roles: [{ roleName: 'EMPLOYEE' }],
      },
    );
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: target.userId }))
        .isActive,
    ).toBe(true);
    await users.update(fixtures.terminated.userId, { isActive: true }, actor);
    expect(
      (
        await db
          .getRepository(Employee)
          .findOneByOrFail({ id: fixtures.terminated.id })
      ).status,
    ).toBe('terminated');
    expect(
      (await service.getEmployeeSelector(organizationId, {})).map(
        (row) => row.id,
      ),
    ).toEqual([target.id]);
  });

  it('preserves the final active organization admin account', async () => {
    const adminCheck = jest
      .spyOn(
        users as unknown as { isUserAdmin(id: string): Promise<boolean> },
        'isUserAdmin',
      )
      .mockResolvedValue(true);
    const adminCount = jest
      .spyOn(
        users as unknown as {
          countOrganizationAdmins(id: string): Promise<number>;
        },
        'countOrganizationAdmins',
      )
      .mockResolvedValue(1);
    try {
      await expect(
        users.update(fixtures.active.userId, { isActive: false }, actor),
      ).rejects.toThrow('At least one active admin');
      expect(
        (
          await db
            .getRepository(User)
            .findOneByOrFail({ id: fixtures.active.userId })
        ).isActive,
      ).toBe(true);
    } finally {
      adminCheck.mockRestore();
      adminCount.mockRestore();
    }
  });
});
