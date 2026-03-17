import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveOrganizationConfigToSettingsTable1765000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL UNIQUE REFERENCES organizations(organization_id) ON DELETE CASCADE,
        home_header_background_color varchar(20),
        home_header_media_url text,
        home_header_media_start_date date,
        home_header_media_end_date date,
        resignation_policy text,
        resignation_notice_period_days int NOT NULL DEFAULT 30,
        allow_early_relieving_by_admin boolean NOT NULL DEFAULT false,
        session_start_month int NOT NULL DEFAULT 4,
        leave_carry_forward_enabled boolean NOT NULL DEFAULT false,
        wfh_carry_forward_enabled boolean NOT NULL DEFAULT false,
        created_on timestamptz NOT NULL DEFAULT now(),
        updated_on timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO organization_settings (
        organization_id,
        home_header_background_color,
        home_header_media_url,
        home_header_media_start_date,
        home_header_media_end_date,
        resignation_policy,
        resignation_notice_period_days,
        allow_early_relieving_by_admin,
        session_start_month,
        leave_carry_forward_enabled,
        wfh_carry_forward_enabled
      )
      SELECT
        o.organization_id,
        m.background_color,
        m.media_url,
        m.media_start_date,
        m.media_end_date,
        r.policy,
        COALESCE(r.notice_period_days, 30),
        COALESCE(r.allow_early_relieving_by_admin, false),
        COALESCE(o.session_start_month, 4),
        COALESCE(o.leave_carry_forward_enabled, false),
        COALESCE(o.wfh_carry_forward_enabled, false)
      FROM organizations o
      LEFT JOIN organization_mobile_header_settings m ON m.organization_id = o.organization_id
      LEFT JOIN organization_resignation_settings r ON r.organization_id = o.organization_id
      ON CONFLICT (organization_id) DO UPDATE SET
        home_header_background_color = EXCLUDED.home_header_background_color,
        home_header_media_url = EXCLUDED.home_header_media_url,
        home_header_media_start_date = EXCLUDED.home_header_media_start_date,
        home_header_media_end_date = EXCLUDED.home_header_media_end_date,
        resignation_policy = EXCLUDED.resignation_policy,
        resignation_notice_period_days = EXCLUDED.resignation_notice_period_days,
        allow_early_relieving_by_admin = EXCLUDED.allow_early_relieving_by_admin,
        session_start_month = EXCLUDED.session_start_month,
        leave_carry_forward_enabled = EXCLUDED.leave_carry_forward_enabled,
        wfh_carry_forward_enabled = EXCLUDED.wfh_carry_forward_enabled,
        updated_on = now()
    `);

    await queryRunner.query(`
      ALTER TABLE organizations
      DROP COLUMN IF EXISTS session_start_month,
      DROP COLUMN IF EXISTS leave_carry_forward_enabled,
      DROP COLUMN IF EXISTS wfh_carry_forward_enabled
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS organization_mobile_header_settings`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_resignation_settings`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
      ADD COLUMN IF NOT EXISTS session_start_month int NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS leave_carry_forward_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS wfh_carry_forward_enabled boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE organizations o
      SET
        session_start_month = COALESCE(s.session_start_month, 4),
        leave_carry_forward_enabled = COALESCE(s.leave_carry_forward_enabled, false),
        wfh_carry_forward_enabled = COALESCE(s.wfh_carry_forward_enabled, false)
      FROM organization_settings s
      WHERE s.organization_id = o.organization_id
    `);

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
      FROM organization_settings
      ON CONFLICT (organization_id) DO UPDATE SET
        background_color = EXCLUDED.background_color,
        media_url = EXCLUDED.media_url,
        media_start_date = EXCLUDED.media_start_date,
        media_end_date = EXCLUDED.media_end_date,
        updated_on = now()
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
        resignation_notice_period_days,
        allow_early_relieving_by_admin
      FROM organization_settings
      ON CONFLICT (organization_id) DO UPDATE SET
        policy = EXCLUDED.policy,
        notice_period_days = EXCLUDED.notice_period_days,
        allow_early_relieving_by_admin = EXCLUDED.allow_early_relieving_by_admin,
        updated_on = now()
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS organization_settings`);
  }
}
