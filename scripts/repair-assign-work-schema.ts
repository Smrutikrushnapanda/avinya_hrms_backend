import { TableColumn } from 'typeorm';
import dataSource from '../src/config/typeorm.config';
import { ProjectTask } from '../src/modules/clients/entities/project-task.entity';
import { ProjectIssue } from '../src/modules/project/entities/project-issue.entity';
import { verifySchemaTarget } from './verify-schema-target';

async function main(): Promise<void> {
  dataSource.setOptions({
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
  });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    await runner.startTransaction();
    await verifySchemaTarget(runner);
    await runner.query('SET LOCAL search_path TO pg_catalog');
    await runner.query("SET LOCAL lock_timeout = '5s'");
    const repairs = [
      [
        ProjectTask,
        [
          'externalAssignerName',
          'assignmentDate',
          'assignmentRemarks',
          'completedPointIndexes',
        ],
      ],
      [ProjectIssue, ['projectId', 'completedPointIndexes']],
    ] as const;
    for (const [entity, properties] of repairs) {
      const metadata = dataSource.getMetadata(entity);
      const table = await runner.getTable(metadata.tablePath);
      if (!table) {
        throw new Error(
          `Required assignment table not found: ${metadata.tableName}`,
        );
      }
      for (const property of properties) {
        const column = metadata.findColumnWithPropertyName(property);
        if (!column) throw new Error('Required assignment metadata not found');
        const type = dataSource.driver.normalizeType(column);
        const existing = table.findColumnByName(column.databaseName);
        const name = `${metadata.tableName}.${column.databaseName}`;
        const isProjectId = property === 'projectId';
        if (!existing) {
          if (isProjectId) {
            throw new Error(`Required assignment column not found: ${name}`);
          }
          await runner.addColumn(
            table,
            new TableColumn({
              name: column.databaseName,
              type,
              length: column.length,
              isNullable: column.isNullable,
            }),
          );
          console.log(`Added ${name}`);
          continue;
        }
        const isChecklist = property === 'completedPointIndexes';
        const relaxNullability = isChecklist || isProjectId;
        if (
          existing.type !== type ||
          existing.length !== column.length ||
          existing.isArray !== column.isArray ||
          (relaxNullability &&
            (existing.generatedType || existing.isGenerated)) ||
          (!relaxNullability && existing.isNullable !== column.isNullable)
        ) {
          const actualType = `${existing.type}${existing.isArray ? '[]' : ''}`;
          throw new Error(
            `Unexpected column definition: ${name} (type=${actualType}, nullable=${existing.isNullable})`,
          );
        }
        if (
          (relaxNullability && !existing.isNullable) ||
          (isChecklist && existing.default != null)
        ) {
          const repaired = existing.clone();
          repaired.isNullable = true;
          if (isChecklist) repaired.default = undefined;
          await runner.changeColumn(table, existing, repaired);
          console.log(`Repaired ${name}`);
        }
      }
    }
    await runner.commitTransaction();
    console.log(
      'Assign Work external assignment, project and checklist columns verified.',
    );
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    /^(Required assignment|Unexpected column definition:|Unexpected schema target:|Required schema not found:)/.test(
      error.message,
    )
      ? error.message
      : 'Check database access, schema permissions and lock availability.';
  console.error(`Assign Work schema repair failed. ${message}`);
  process.exitCode = 1;
});
