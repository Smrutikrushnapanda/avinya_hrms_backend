import type { QueryRunner } from 'typeorm';

export async function verifySchemaTarget(runner: QueryRunner): Promise<string> {
  const options = runner.connection.options;
  const schema =
    options.type === 'postgres' ? (options.schema ?? 'public') : 'public';
  const [target] = (await runner.query(
    `SELECT current_database() AS database,
            current_schema() AS "sessionSchema",
            current_setting('server_version_num') AS "serverVersion",
            EXISTS (SELECT FROM pg_catalog.pg_namespace WHERE nspname = $1) AS "schemaExists"`,
    [schema],
  )) as {
    database: string;
    sessionSchema: string | null;
    serverVersion: string;
    schemaExists: boolean;
  }[];
  const { HRMS_EXPECTED_DATABASE, HRMS_EXPECTED_SCHEMA } = process.env;
  const actual = `database=${target.database} schema=${schema} session_schema=${target.sessionSchema ?? '(none)'} server_version_num=${target.serverVersion}`;
  console.log(`Schema target: ${actual}`);
  if (
    (HRMS_EXPECTED_DATABASE && target.database !== HRMS_EXPECTED_DATABASE) ||
    (HRMS_EXPECTED_SCHEMA && schema !== HRMS_EXPECTED_SCHEMA)
  ) {
    throw new Error(
      `Unexpected schema target: expected database=${HRMS_EXPECTED_DATABASE ?? '(any)'} schema=${HRMS_EXPECTED_SCHEMA ?? '(any)'}, received ${actual}`,
    );
  }
  if (!target.schemaExists)
    throw new Error(`Required schema not found: ${schema}`);
  return schema;
}
