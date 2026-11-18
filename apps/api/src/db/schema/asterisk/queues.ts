import { mysqlTable, varchar, int, type MySqlColumnBuilderBase } from 'drizzle-orm/mysql-core';
import { QUEUE_COLUMNS } from '@voip-manager/shared';

const dyn = (cols: readonly string[], except: readonly string[]) =>
  Object.fromEntries(
    cols.filter((c) => !except.includes(c)).map((c) => [c, varchar(c, { length: 255 })]),
  ) as Record<string, MySqlColumnBuilderBase>;

export const queues = mysqlTable('queues', {
  name: varchar('name', { length: 128 }).primaryKey(),
  musiconhold: varchar('musiconhold', { length: 128 }),
  context: varchar('context', { length: 128 }),
  strategy: varchar('strategy', { length: 40 }),
  timeout: int('timeout'),
  retry: int('retry'),
  wrapuptime: int('wrapuptime'),
  maxlen: int('maxlen'),
  servicelevel: int('servicelevel'),
  weight: int('weight'),
  ...dyn(QUEUE_COLUMNS, ['musiconhold', 'context', 'strategy', 'timeout', 'retry', 'wrapuptime', 'maxlen', 'servicelevel', 'weight']),
});

export const queueMembers = mysqlTable('queue_members', {
  uniqueid: int('uniqueid').autoincrement().primaryKey(),
  queue_name: varchar('queue_name', { length: 80 }).notNull(),
  interface: varchar('interface', { length: 80 }).notNull(),
  membername: varchar('membername', { length: 80 }),
  state_interface: varchar('state_interface', { length: 80 }),
  penalty: int('penalty'),
  paused: int('paused'),
  wrapuptime: int('wrapuptime'),
  ringinuse: varchar('ringinuse', { length: 10 }),
  reason_paused: varchar('reason_paused', { length: 80 }),
});
