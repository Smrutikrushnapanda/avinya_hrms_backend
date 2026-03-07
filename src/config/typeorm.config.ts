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

const isProduction = process.env.NODE_ENV === 'production';

const dataSource = new DataSource({
  type: 'postgres',
  host: requireEnv('DB_HOST'),
  port: parseInt(requireEnv('DB_PORT')),
  username: requireEnv('DB_USERNAME'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  schema: 'public',

  entities: [path.join(__dirname, '/../modules/**/entities/*.entity{.ts,.js}')],
  migrations: [path.join(__dirname, '/../database/migrations/*{.ts,.js}')],

  synchronize: true,

  // Production (Supabase): SSL + pgBouncer pool constraints
  // Local: no SSL, normal pool
  ...(isProduction && {
    poolSize: 1,
    ssl: { rejectUnauthorized: false },
    extra: {
      ssl: { rejectUnauthorized: false },
      options: '-c search_path=public,extensions',
      max: 1,
      idleTimeoutMillis: 600000,
      connectionTimeoutMillis: 30000,
    },
  }),

  logging: false,
});

export default dataSource;
