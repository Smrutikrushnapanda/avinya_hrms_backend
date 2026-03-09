import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueBranchNameConstraint1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, clean up any existing duplicates by keeping the most recent one
    await queryRunner.query(`
      DELETE FROM branches a USING branches b
      WHERE a.id < b.id
        AND a.organization_id = b.organization_id
        AND LOWER(TRIM(REGEXP_REPLACE(a.name, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE(b.name, '\\s+', ' ', 'g')))
    `);

    // Add a unique index on organization_id and normalized name
    // Using a functional index to normalize the name
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_branches_org_normalized_name 
      ON branches (organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_branches_org_normalized_name`);
  }
}
