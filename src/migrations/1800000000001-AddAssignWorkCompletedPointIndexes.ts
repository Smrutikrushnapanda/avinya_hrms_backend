import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAssignWorkCompletedPointIndexes1800000000001
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    for (const table of ['project_tasks', 'project_issues']) {
      const path = `${schema}.${table}`;
      if (!(await queryRunner.hasColumn(path, 'completed_point_indexes'))) {
        await queryRunner.addColumn(
          path,
          new TableColumn({
            name: 'completed_point_indexes',
            type: 'jsonb',
            isNullable: true,
          }),
        );
      }
    }
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Checklist columns contain persisted progress. Roll back application code without dropping these columns.',
      ),
    );
  }
}
