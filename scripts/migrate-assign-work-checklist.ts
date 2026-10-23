import dataSource from '../src/config/typeorm.config';
import { AddAssignWorkCompletedPointIndexes1800000000001 } from '../src/migrations/1800000000001-AddAssignWorkCompletedPointIndexes';

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  dataSource.setOptions({
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    migrations: [AddAssignWorkCompletedPointIndexes1800000000001],
  });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    const schema =
      (dataSource.options as { schema?: string }).schema ?? 'public';
    const target = (await runner.query(
      'SELECT current_database() AS database',
    )) as { database: string }[];
    console.log(
      `Assign Work schema target: database=${target[0].database} schema=${schema}`,
    );
    if (!checkOnly) {
      const applied = await dataSource.runMigrations({ transaction: 'all' });
      console.log(`Assign Work migrations applied: ${applied.length}`);
    }
    const missing: string[] = [];
    for (const name of ['project_tasks', 'project_issues']) {
      const table = await runner.getTable(`${schema}.${name}`);
      const metadata = dataSource.entityMetadatas.find(
        (entry) => entry.tableName === name,
      );
      if (!table || !metadata)
        throw new Error('Required assignment table not found');
      for (const column of metadata.columns) {
        const actual = table.findColumnByName(column.databaseName);
        if (!actual) {
          missing.push(`${name}.${column.databaseName}`);
        } else if (
          name === 'project_tasks' ||
          column.databaseName === 'completed_point_indexes'
        ) {
          if (
            actual.type !== dataSource.driver.normalizeType(column) ||
            actual.isNullable !== column.isNullable
          ) {
            throw new Error(
              `Unexpected column definition: ${name}.${column.databaseName}`,
            );
          }
        }
      }
    }
    if (missing.length)
      throw new Error(`Missing columns: ${missing.join(', ')}`);
    console.log(
      'Assign Work schema verified: task entity and checklist columns match.',
    );
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    /^(Missing columns:|Unexpected column definition:|Required assignment table)/.test(
      error.message,
    )
      ? error.message
      : 'Check database access, migration history and schema permissions.';
  console.error(`Assign Work schema check/update failed. ${message}`);
  process.exitCode = 1;
});
