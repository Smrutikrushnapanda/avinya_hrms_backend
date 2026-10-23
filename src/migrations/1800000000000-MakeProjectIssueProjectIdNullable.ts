import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeProjectIssueProjectIdNullable1800000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_issues" ALTER COLUMN "project_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add NOT NULL only if all rows have a project_id
    await queryRunner.query(
      `ALTER TABLE "project_issues" ALTER COLUMN "project_id" SET NOT NULL`,
    );
  }
}
