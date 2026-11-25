import { TableColumn } from 'typeorm';
import dataSource from '../src/config/typeorm.config';
import { ProjectTask } from '../src/modules/clients/entities/project-task.entity';

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
    await runner.query("SET LOCAL lock_timeout = '5s'");
    const metadata = dataSource.getMetadata(ProjectTask);
    const table = await runner.getTable(metadata.tablePath);
    if (!table) throw new Error('Required assignment table not found');
    for (const property of [
      'externalAssignerName',
      'assignmentDate',
      'assignmentRemarks',
    ]) {
      const column = metadata.findColumnWithPropertyName(property);
      if (!column) throw new Error('Required assignment metadata not found');
      const type = dataSource.driver.normalizeType(column);
      const existing = table.findColumnByName(column.databaseName);
      if (existing) {
        if (
          existing.type !== type ||
          existing.isNullable !== column.isNullable ||
          existing.length !== column.length
        ) {
          throw new Error(
            `Unexpected column definition: ${column.databaseName}`,
          );
        }
        continue;
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
      console.log(`Added project_tasks.${column.databaseName}`);
    }
    await runner.commitTransaction();
    console.log('Assign Work external assignment columns verified.');
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
    /^(Required assignment|Unexpected column definition:)/.test(error.message)
      ? error.message
      : 'Check database access, schema permissions and lock availability.';
  console.error(`Assign Work schema repair failed. ${message}`);
  process.exitCode = 1;
});
