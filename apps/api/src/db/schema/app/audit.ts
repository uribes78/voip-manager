import { mysqlTable, bigint, int, varchar, datetime, json, index } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const vmAudit = mysqlTable(
  'vm_audit',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    userId: int('user_id'),
    username: varchar('username', { length: 50 }),
    action: varchar('action', { length: 40 }).notNull(),
    resource: varchar('resource', { length: 40 }).notNull(),
    resourceId: varchar('resource_id', { length: 128 }),
    details: json('details').$type<unknown>(),
    ip: varchar('ip', { length: 45 }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('vm_audit_created_idx').on(t.createdAt), index('vm_audit_resource_idx').on(t.resource, t.resourceId)],
);
