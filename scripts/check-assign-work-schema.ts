import { TableColumn } from 'typeorm';
import dataSource from '../src/config/typeorm.config';
import { verifySchemaTarget } from './verify-schema-target';

const tables = [
  'project_tasks',
  'project_issues',
  'users',
  'client_projects',
  'projects',
];
const noDefaultColumns = new Set([
  'project_tasks.external_assigner_name',
  'project_tasks.assignment_date',
  'project_tasks.assignment_remarks',
  'project_tasks.completed_point_indexes',
  'project_issues.completed_point_indexes',
  'project_issues.project_id',
]);

interface PostgresColumn {
  tableName: string;
  columnName: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean;
}

function canonicalType(type: string): string {
  return type
    .toLowerCase()
    .replace(/ array$/, '[]')
    .replace(
      /^(timestamp|time)(\(\d+\))?(?=(?:\[\])?$)/,
      '$1$2 without time zone',
    )
    .replace(/^(timestamp|time)\(6\)(?= (?:with|without) time zone)/, '$1');
}

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
    await runner.query('SET TRANSACTION READ ONLY');
    const schema = await verifySchemaTarget(runner);
    await runner.query('SET LOCAL search_path TO pg_catalog');
    const columns = (await runner.query(
      `SELECT t.relname AS "tableName", a.attname AS "columnName",
              pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
              NOT a.attnotnull AS nullable, a.atthasdef AS "hasDefault",
              (a.attgenerated <> '' OR a.attidentity <> '') AS generated
       FROM pg_catalog.pg_class t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid
       WHERE n.nspname = $1 AND t.relname = ANY($2::text[])
         AND t.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`,
      [schema, tables],
    )) as PostgresColumn[];
    const missing: string[] = [];
    const driver = dataSource.driver;
    for (const name of tables) {
      const tableColumns = columns.filter(
        (column) => column.tableName === name,
      );
      const metadata = dataSource.entityMetadatas.find(
        (entry) => entry.tableName === name,
      );
      if (tableColumns.length === 0 || !metadata)
        throw new Error(`Required assignment table not found: ${name}`);
      for (const column of metadata.columns) {
        const columnName = `${name}.${column.databaseName}`;
        const actual = tableColumns.find(
          (entry) => entry.columnName === column.databaseName,
        );
        if (!actual) {
          missing.push(columnName);
          continue;
        }
        const expectedType = canonicalType(
          driver.createFullType(
            new TableColumn({
              name: column.databaseName,
              type: driver.normalizeType(column),
              length: driver.getColumnLength(column),
              precision: column.precision ?? undefined,
              scale: column.scale,
              isArray: column.isArray,
            }),
          ),
        );
        const checkDefault = noDefaultColumns.has(columnName);
        if (
          canonicalType(actual.type) !== expectedType ||
          actual.nullable !== column.isNullable ||
          (checkDefault && (actual.hasDefault || actual.generated))
        ) {
          const expectedDefault = checkDefault
            ? ', default=none, generated=false'
            : '';
          throw new Error(
            `Unexpected column definition: ${columnName} (expected type=${expectedType}, nullable=${column.isNullable}${expectedDefault}; found type=${actual.type}, nullable=${actual.nullable}, default=${actual.hasDefault ? 'set' : 'none'}, generated=${actual.generated})`,
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
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error &&
    /^(Missing columns:|Unexpected column definition:|Required assignment table|Unexpected schema target:|Required schema not found:)/.test(
      error.message,
    )
      ? error.message
      : 'Check database access and schema permissions.';
  console.error(`Assign Work schema check failed. ${message}`);
  process.exitCode = 1;
});
