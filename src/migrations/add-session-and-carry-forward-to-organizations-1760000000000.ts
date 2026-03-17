import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionAndCarryForwardToOrganizations1760000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS session_start_month int NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS leave_carry_forward_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS wfh_carry_forward_enabled boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
      DROP COLUMN IF EXISTS wfh_carry_forward_enabled,
      DROP COLUMN IF EXISTS leave_carry_forward_enabled,
      DROP COLUMN IF EXISTS session_start_month
    `);
  }
}

