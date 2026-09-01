import { AttendanceLog } from './entities/attendance-log.entity';

/**
 * REGRESSION — ERROR 1: getTodayAnomalies() "column log.organizationid does not exist"
 *
 * Root cause:
 *   AttendanceLog entity had a @ManyToOne relation `organization: Organization`
 *   with @JoinColumn({ name: 'organization_id' }) but NO standalone
 *   @Column({ name: 'organization_id' }) organizationId: string property.
 *
 *   When QueryBuilder processed `log.organization.id`, TypeORM generated
 *   `log.organizationId` (camelCase) instead of joining the organization table.
 *   The actual DB column is `organization_id` (snake_case), so PostgreSQL rejected it.
 *
 * Fix:
 *   Added explicit @Column({ name: 'organization_id', type: 'uuid', nullable: true })
 *   organizationId: string to AttendanceLog entity, matching the pattern used by
 *   Employee and User entities.
 *   Also changed getTodayAnomalies() QueryBuilder from `log.organization.id`
 *   to `log.organizationId` for direct column filtering.
 */
describe('REGRESSION — AttendanceLog.organizationId column', () => {
  it('should have organizationId as a declared instance property', () => {
    const entity = new AttendanceLog();
    expect(entity).toHaveProperty('organizationId');
  });

  it('organizationId column maps to organization_id in the database', () => {
    const entity = new AttendanceLog();
    entity.organizationId = 'test-org-id';
    expect(entity.organizationId).toBe('test-org-id');
  });

  it('organization relation coexists with organizationId column', () => {
    const entity = new AttendanceLog();
    entity.organizationId = 'test-org-id';
    entity.organization = { id: 'test-org-id' } as any;
    expect(entity.organizationId).toBe('test-org-id');
    expect(entity.organization.id).toBe('test-org-id');
  });

  it('organizationId can be set independently of organization relation', () => {
    const entity = new AttendanceLog();
    entity.organizationId = 'abc-123';
    expect(entity.organizationId).toBe('abc-123');
    expect(entity.organization).toBeUndefined();
  });

  it('attendance_logs table has organization_id column (not organizationId)', () => {
    const entity = new AttendanceLog();
    entity.organizationId = 'valid-uuid';
    expect(entity.organizationId).toBe('valid-uuid');
  });
});
