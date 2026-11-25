import dataSource from '../src/config/typeorm.config';

async function main(): Promise<void> {
  dataSource.setOptions({
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
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
    const missing: string[] = [];
    for (const name of [
      'project_tasks',
      'project_issues',
      'users',
      'client_projects',
      'projects',
    ]) {
      const table = await runner.getTable(`${schema}.${name}`);
      const metadata = dataSource.entityMetadatas.find(
        (entry) => entry.tableName === name,
      );
      if (!table || !metadata)
        throw new Error(`Required assignment table not found: ${name}`);
      for (const column of metadata.columns) {
        const actual = table.findColumnByName(column.databaseName);
        if (!actual) missing.push(`${name}.${column.databaseName}`);
        else if (
          actual.type !== dataSource.driver.normalizeType(column) ||
          actual.isNullable !== column.isNullable ||
          actual.isArray !== column.isArray ||
          (column.databaseName === 'completed_point_indexes' &&
            actual.default != null)
        ) {
          throw new Error(
            `Unexpected column definition: ${name}.${column.databaseName}`,
          );
        }
      }
    }
    if (missing.length)
      throw new Error(`Missing columns: ${missing.join(', ')}`);
    console.log(
      'Assign Work schema verified: assignment entities, checklist columns and joined user/project tables match.',
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
      : 'Check database access and schema permissions.';
  console.error(`Assign Work schema check failed. ${message}`);
  process.exitCode = 1;
});
