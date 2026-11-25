import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dataSource from '../src/config/typeorm.config';
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
    const schema = await verifySchemaTarget(runner);
    const quotedSchema = `"${schema.replaceAll('"', '""')}"`;
    await runner.query("SELECT set_config('search_path', $1, false)", [
      quotedSchema,
    ]);
    for (const filename of [
      'designation-departments.sql',
      'request-email-configuration.sql',
    ]) {
      const sql = readFileSync(resolve(__dirname, '../sql', filename), 'utf8');
      await runner.query(sql.replaceAll('public.', ''));
    }
    console.log(`Request email schema prepared in ${schema}.`);
  } catch (error) {
    await runner.query('ROLLBACK');
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Request email schema repair failed. ${message}`);
  process.exitCode = 1;
});
