import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organization-based timezone (STEP 4):
 *  - Adds organization_settings.timezone (IANA identifier, default Asia/Kolkata).
 *  - Backfills existing organization_settings.timezone from the legacy
 *    attendance_settings.timezone so each organization keeps its current
 *    effective timezone. This is an EXPLICIT production migration — it does
 *    NOT rely on TypeORM synchronize to migrate data.
 *
 * Natural-flow safety: adding the column with a default backfills Asia/Kolkata
 * for all rows; the UPDATE below then overrides with the org's attendance
 * timezone where one exists. Rows without an attendance_settings row remain
 * Asia/Kolkata (backward-compatible default).
 */
export class AddOrganizationTimezone1766000000000
  implements MigrationInterface
{
  name = 'AddOrganizationTimezone1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the column (idempotent). Default Asia/Kolkata for existing rows.
    await queryRunner.query(`
      ALTER TABLE organization_settings
      ADD COLUMN IF NOT EXISTS timezone varchar(50) NOT NULL DEFAULT 'Asia/Kolkata'
    `);

    // 2. Backfill from legacy attendance_settings.timezone.
    await queryRunner.query(`
      UPDATE organization_settings os
      SET timezone = COALESCE(NULLIF(as_settings.timezone, ''), 'Asia/Kolkata'),
          updated_on = now()
      FROM attendance_settings as_settings
      WHERE as_settings.organization_id = os.organization_id
        AND NULLIF(as_settings.timezone, '') IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE organization_settings DROP COLUMN IF EXISTS timezone`,
    );
  }
}
