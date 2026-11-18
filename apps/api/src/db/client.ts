import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import type { Env } from '../config/env.js';

export type Db = MySql2Database<typeof schema>;

export function createDb(env: Env) {
  const pool = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z',
    charset: 'utf8mb4',
    supportBigNumbers: true,
  });
  const db = drizzle(pool, { schema, mode: 'default' });
  return { db, pool };
}

export async function pingDb(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

/** Verifica que el esquema realtime de Asterisk (Alembic) esté instalado. */
export async function asteriskSchemaInstalled(db: Db): Promise<{ config: boolean; cdr: boolean }> {
  const has = async (table: string) => {
    const [rows] = await db.execute(
      sql`SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${table}`,
    );
    const first = (rows as unknown as Array<{ c: number | string }>)[0];
    return Number(first?.c ?? 0) > 0;
  };
  return { config: await has('ps_endpoints'), cdr: await has('cdr') };
}
