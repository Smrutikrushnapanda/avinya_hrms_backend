import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHomeHeaderConfigToOrganizations1741680000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_mobile_header_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL UNIQUE REFERENCES organizations(organization_id) ON DELETE CASCADE,
        background_color varchar(20),
        media_url text,
        media_start_date date,
        media_end_date date,
        created_on timestamptz NOT NULL DEFAULT now(),
        updated_on timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_resignation_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL UNIQUE REFERENCES organizations(organization_id) ON DELETE CASCADE,
        policy text,
        notice_period_days int NOT NULL DEFAULT 30,
        allow_early_relieving_by_admin boolean NOT NULL DEFAULT false,
        created_on timestamptz NOT NULL DEFAULT now(),
        updated_on timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO organization_mobile_header_settings (
        organization_id,
        background_color,
        media_url,
        media_start_date,
        media_end_date
      )
      SELECT
        organization_id,
        home_header_background_color,
        home_header_media_url,
        home_header_media_start_date,
        home_header_media_end_date
      FROM organizations
      ON CONFLICT (organization_id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO organization_resignation_settings (
        organization_id,
        policy,
        notice_period_days,
        allow_early_relieving_by_admin
      )
      SELECT
        organization_id,
        resignation_policy,
        COALESCE(resignation_notice_period_days, 30),
        COALESCE(allow_early_relieving_by_admin, false)
      FROM organizations
      ON CONFLICT (organization_id) DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE organizations
      DROP COLUMN IF EXISTS home_header_background_color,
      DROP COLUMN IF EXISTS home_header_media_url,
      DROP COLUMN IF EXISTS home_header_media_start_date,
      DROP COLUMN IF EXISTS home_header_media_end_date,
      DROP COLUMN IF EXISTS resignation_policy,
      DROP COLUMN IF EXISTS resignation_notice_period_days,
      DROP COLUMN IF EXISTS allow_early_relieving_by_admin
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS home_header_background_color varchar(20),
      ADD COLUMN IF NOT EXISTS home_header_media_url text,
      ADD COLUMN IF NOT EXISTS home_header_media_start_date date,
      ADD COLUMN IF NOT EXISTS home_header_media_end_date date,
      ADD COLUMN IF NOT EXISTS resignation_policy text,
      ADD COLUMN IF NOT EXISTS resignation_notice_period_days int DEFAULT 30,
      ADD COLUMN IF NOT EXISTS allow_early_relieving_by_admin boolean DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE organizations o
      SET
        home_header_background_color = s.background_color,
        home_header_media_url = s.media_url,
        home_header_media_start_date = s.media_start_date,
        home_header_media_end_date = s.media_end_date
      FROM organization_mobile_header_settings s
      WHERE s.organization_id = o.organization_id
    `);

    await queryRunner.query(`
      UPDATE organizations o
      SET
        resignation_policy = s.policy,
        resignation_notice_period_days = s.notice_period_days,
        allow_early_relieving_by_admin = s.allow_early_relieving_by_admin
      FROM organization_resignation_settings s
      WHERE s.organization_id = o.organization_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS organization_resignation_settings`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_mobile_header_settings`);
  }
}
