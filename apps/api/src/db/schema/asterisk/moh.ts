import { mysqlTable, varchar, int, datetime } from 'drizzle-orm/mysql-core';

/** Clases de música en espera (realtime de res_musiconhold). */
export const musiconhold = mysqlTable('musiconhold', {
  name: varchar('name', { length: 80 }).primaryKey(),
  mode: varchar('mode', { length: 20 }),
  directory: varchar('directory', { length: 255 }),
  application: varchar('application', { length: 255 }),
  digit: varchar('digit', { length: 1 }),
  sort: varchar('sort', { length: 10 }),
  format: varchar('format', { length: 10 }),
  stamp: datetime('stamp', { mode: 'date' }),
  loop_last: varchar('loop_last', { length: 3 }),
});

export const musiconholdEntry = mysqlTable('musiconhold_entry', {
  name: varchar('name', { length: 80 }).notNull(),
  position: int('position').notNull(),
  entry: varchar('entry', { length: 1024 }).notNull(),
});
