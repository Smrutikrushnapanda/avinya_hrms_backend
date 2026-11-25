import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Organization } from '../auth-core/entities/organization.entity';
import { User } from '../auth-core/entities/user.entity';
import { Employee } from './entities/employee.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { PayrollRecord } from '../payroll/entities/payroll-record.entity';
import { PayrollService } from '../payroll/payroll.service';
import { OfficeTripRequest } from '../office-trip/entities/office-trip-request.entity';
import { OfficeTripService } from '../office-trip/office-trip.service';
import { ProjectService } from '../project/project.service';
import { LeaveService } from '../leave/leave.service';
import { WfhService } from '../wfh/wfh.service';
import { ExpensesService } from '../expenses/expenses.service';

const url = process.env.ASSIGN_WORK_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;

integration('Employee search filters across paginated modules', () => {
  let db: DataSource;
  let department: Department;
  let designation: Designation;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const schema = `employee_filters_${Date.now()}`;
  const date = '2026-11-24';
  const employees: Employee[] = [];

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
      .save({ name: 'Engineering', code: 'ENG', organizationId: org });
    const hr = await db
      .getRepository(Department)
      .save({ name: 'HR', code: 'HR', organizationId: org });
    designation = await db.getRepository(Designation).save({
      name: 'Developer',
      organizationId: org,
      departmentId: department.id,
    });
    const recruiter = await db
      .getRepository(Designation)
      .save({ name: 'Recruiter', organizationId: org, departmentId: hr.id });
    for (const [index, tenant, dept, desig] of [
      [0, org, department.id, designation.id],
      [1, org, hr.id, recruiter.id],
      [2, org, department.id, designation.id],
      [3, otherOrg, department.id, designation.id],
    ] as const) {
      const user = await db.getRepository(User).save({
        userName: `${schema}_${index}`,
        email: `${schema}_${index}@example.test`,
        password: 'unused-test-hash',
        firstName: `Employee${index}`,
        lastName: 'Test',
        organizationId: tenant,
      });
      const employee = await db.getRepository(Employee).save({
        organizationId: tenant,
        userId: user.id,
        firstName: user.firstName,
        employeeCode: `FILTER-${index}`,
        workEmail: user.email,
        departmentId: dept,
        designationId: desig,
        dateOfJoining: new Date(date),
      });
      employees.push(employee);
      await db.getRepository(Attendance).save({
        organization: { id: tenant },
        user: { id: user.id },
        attendanceDate: date,
        status: 'present',
      });
      await db.getRepository(PayrollRecord).save({
        organizationId: tenant,
        employeeId: employee.id,
        payPeriod: '2026-11',
        periodStart: new Date('2026-11-01'),
        periodEnd: new Date('2026-11-30'),
        basic: 1,
        hra: 0,
        conveyance: 0,
        otherAllowances: 0,
        pf: 0,
        tds: 0,
        totalEarnings: 1,
        totalDeductions: 0,
        netPay: 1,
      });
      await db.getRepository(OfficeTripRequest).save({
        organizationId: tenant,
        userId: user.id,
        tripType: 'OFFICE_TRIP',
        fromDate: date,
        toDate: date,
        clientOfficeName: 'Office',
        location: 'Local',
        purpose: 'Test',
      });
    }
  }, 60000);

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('filters attendance before counting and paginating while preserving tenant scope', async () => {
    const service = Object.create(
      AttendanceService.prototype,
    ) as AttendanceService;
    Object.assign(service, {
      attendanceRepo: db.getRepository(Attendance),
      timezoneService: {
        getOrganizationTimezone: () => Promise.resolve('UTC'),
      },
    });
    const result = await service.getAttendanceByDateWithFilters(
      org,
      date,
      1,
      1,
      undefined,
      'all',
      department.id,
      designation.id,
    );
    expect(result.pagination.total).toBe(2);
    expect(result.results).toHaveLength(1);
    const empty = await service.getAttendanceByDateWithFilters(
      org,
      date,
      1,
      10,
      undefined,
      'all',
      department.id,
      randomUUID(),
    );
    expect(empty.pagination.total).toBe(0);
  });

  it('combines payroll search, department, designation and pagination on server', async () => {
    const service = Object.create(PayrollService.prototype) as PayrollService;
    Object.assign(service, { payrollRepo: db.getRepository(PayrollRecord) });
    const result = await service.findAll({
      organizationId: org,
      departmentId: department.id,
      designationId: designation.id,
      page: 1,
      limit: 1,
    });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(1);
    const searched = await service.findAll({
      organizationId: org,
      departmentId: department.id,
      designationId: designation.id,
      search: 'Employee2',
    });
    expect(searched.data.map((record) => record.employeeId)).toEqual([
      employees[2].id,
    ]);
  });

  it('filters office trips by designation without requiring a department', async () => {
    const service = Object.create(
      OfficeTripService.prototype,
    ) as OfficeTripService;
    Object.assign(service, {
      tripRepo: db.getRepository(OfficeTripRequest),
      employeeRepo: db.getRepository(Employee),
    });
    const records = await service.getAllTrips(org, {
      designationId: designation.id,
    });
    expect(records.map((record) => record.userId).sort()).toEqual(
      [employees[0].userId, employees[2].userId].sort(),
    );
    expect(
      await service.getAllTrips(org, {
        departmentId: department.id,
        designationId: randomUUID(),
      }),
    ).toEqual([]);
  });

  it('filters project candidates while preserving active status, self exclusion and tenant scope', async () => {
    const service = Object.create(ProjectService.prototype) as ProjectService;
    Object.assign(service, { employeeRepo: db.getRepository(Employee) });
    const records = await service.getAllOrgEmployees(org, employees[0].userId, {
      departmentId: department.id,
      designationId: designation.id,
    });
    expect(records.map((record) => record.userId)).toEqual([
      employees[2].userId,
    ]);
    expect(records[0]).toMatchObject({
      departmentId: department.id,
      department: 'Engineering',
      designationId: designation.id,
      designation: 'Developer',
    });
  });

  it.each([LeaveService, WfhService, ExpensesService])(
    'retains classification on historical request users using %p',
    async (Service) => {
      await db
        .getRepository(Employee)
        .update(employees[0].id, { status: 'inactive' });
      const service = Object.create(Service.prototype) as {
        employeeRepo: Repository<Employee>;
        overlayEmployeeNames: (users: { id: string }[]) => Promise<void>;
      };
      service.employeeRepo = db.getRepository(Employee);
      const user = { id: employees[0].userId };
      await service.overlayEmployeeNames([user]);
      expect(user).toMatchObject({
        department: { id: department.id, name: 'Engineering' },
        designation: { id: designation.id, name: 'Developer' },
      });
    },
  );
});
