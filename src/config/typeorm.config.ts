import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env' });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is missing.`);
  }
  return value;
}

const databaseUrl = process.env.DATABASE_URL;
const dbSchema = process.env.DB_SCHEMA || 'public';
const hostedConnection =
  Boolean(databaseUrl) || process.env.NODE_ENV === 'production';
const dbSslFlag = (process.env.DB_SSL || '').toLowerCase();
const useSsl =
  dbSslFlag === 'true' ||
  dbSslFlag === '1' ||
  dbSslFlag === 'yes' ||
  /sslmode=require/i.test(databaseUrl || '');

const connectionOptions = databaseUrl
  ? {
      url: databaseUrl,
    }
  : {
      host: requireEnv('DB_HOST'),
      port: parseInt(requireEnv('DB_PORT')),
      username: requireEnv('DB_USERNAME'),
      password: requireEnv('DB_PASSWORD'),
      database: requireEnv('DB_NAME'),
    };

const dataSource = new DataSource({
  type: 'postgres',
  ...connectionOptions,
  schema: dbSchema,

  entities: [path.join(__dirname, '/../modules/**/entities/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '/../migrations/*{.ts,.js}')],

  // Schema auto-sync is a dangerous, irreversible operation (drops columns).
  // It stays on for local dev, but in production it must be explicitly
  // enabled via DB_SYNCHRONIZE=true before it runs.
  synchronize:
    process.env.NODE_ENV !== 'production' ||
    (process.env.DB_SYNCHRONIZE || '').toLowerCase() === 'true',

  // Hosted Postgres needs SSL and conservative pool sizing. Raised from the
  // previous single connection (max: 1) so multiple concurrent admins do not
  // serialize every read/write through one connection. Kept conservative (10)
  // to stay within typical free-tier PG limits.
  ...(hostedConnection && {
    poolSize: 10,
    ...(useSsl && { ssl: { rejectUnauthorized: false } }),
    extra: {
      ...(useSsl && { ssl: { rejectUnauthorized: false } }),
      max: 10,
      idleTimeoutMillis: 600000,
      connectionTimeoutMillis: 30000,
    },
  }),

  ...(!hostedConnection && useSsl && { ssl: { rejectUnauthorized: false } }),

  logging: false,
});

export default dataSource;
