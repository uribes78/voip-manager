import { defineConfig } from 'drizzle-kit';

// Solo las tablas propias del servicio (prefijo vm_) se migran con Drizzle.
// El esquema Realtime de Asterisk (ps_*, queues, extensions, cdr) lo instala Alembic (scripts/install-asterisk-schema.sh).
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/app/*.ts',
  out: './drizzle',
  tablesFilter: ['vm_*'],
  dbCredentials: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'asterisk',
    password: process.env.DB_PASSWORD ?? 'asterisk',
    database: process.env.DB_NAME ?? 'asterisk',
  },
});
