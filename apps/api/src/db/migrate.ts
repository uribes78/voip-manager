import { migrate } from 'drizzle-orm/mysql2/migrator';
import { env } from '../config/env.js';
import { createDb } from './client.js';

const { db, pool } = createDb(env);
try {
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log('Migraciones vm_* aplicadas.');
} finally {
  await pool.end();
}
