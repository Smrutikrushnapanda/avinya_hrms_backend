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
const hostedConnection = Boolean(databaseUrl) || process.env.NODE_ENV === 'production';
const useSsl = hostedConnection || process.env.DB_SSL === 'true';

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
  schema: 'public',

  entities: [path.join(__dirname, '/../modules/**/entities/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '/../database/migrations/*{.ts,.js}')],

  synchronize: true,

  // Hosted Postgres needs SSL and conservative pool sizing.
  ...(hostedConnection && {
    poolSize: 1,
    ...(useSsl && { ssl: { rejectUnauthorized: false } }),
    extra: {
      ...(useSsl && { ssl: { rejectUnauthorized: false } }),
      max: 1,
      idleTimeoutMillis: 600000,
      connectionTimeoutMillis: 30000,
    },
  }),

  ...(!hostedConnection && useSsl && { ssl: { rejectUnauthorized: false } }),

  logging: false,
});

export default dataSource;
