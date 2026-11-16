import type { FindOptionsWhere } from 'typeorm';
import type { Cache } from 'cache-manager';
import type { Employee } from '../modules/employee/entities/employee.entity';

export function activeEmployeeWhere(
  where: FindOptionsWhere<Employee>,
): FindOptionsWhere<Employee> {
  return { ...where, status: 'active', user: { isActive: true } };
}

export function employeeListCacheKey(organizationId: string, status: string) {
  return `employees:active-login-v1:${organizationId}:${status}`;
}

export async function invalidateEmployeeLists(
  cache: Cache,
  organizationId: string,
  employeeIds: string[] = [],
) {
  await Promise.all(
    [
      `employees:${organizationId}`,
      ...['active', 'inactive', 'all'].flatMap((status) => [
        `employees:${organizationId}:${status}`,
        employeeListCacheKey(organizationId, status),
      ]),
      `managers:${organizationId}`,
      `managers:active-login-v1:${organizationId}`,
      `dashboard-stats:${organizationId}`,
      ...employeeIds.map((id) => `employee:${id}`),
    ].map((key) => cache.del(key)),
  );
}
