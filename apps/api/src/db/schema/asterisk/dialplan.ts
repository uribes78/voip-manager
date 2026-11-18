import { mysqlTable, varchar, int, bigint } from 'drizzle-orm/mysql-core';

export const extensions = mysqlTable('extensions', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  context: varchar('context', { length: 40 }).notNull(),
  exten: varchar('exten', { length: 40 }).notNull(),
  priority: int('priority').notNull(),
  app: varchar('app', { length: 40 }).notNull(),
  appdata: varchar('appdata', { length: 256 }).notNull(),
});
