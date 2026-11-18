import {
  mysqlTable, int, varchar, boolean, datetime, mysqlEnum, index, uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const vmUsers = mysqlTable(
  'vm_users',
  {
    id: int('id').autoincrement().primaryKey(),
    username: varchar('username', { length: 50 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }),
    role: mysqlEnum('role', ['admin', 'operator', 'viewer']).notNull().default('viewer'),
    active: boolean('active').notNull().default(true),
    lastLoginAt: datetime('last_login_at', { mode: 'date' }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('vm_users_username_uq').on(t.username)],
);

export const vmRefreshTokens = mysqlTable(
  'vm_refresh_tokens',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: datetime('expires_at', { mode: 'date' }).notNull(),
    revokedAt: datetime('revoked_at', { mode: 'date' }),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex('vm_refresh_tokens_hash_uq').on(t.tokenHash), index('vm_refresh_tokens_user_idx').on(t.userId)],
);

export type UserRow = typeof vmUsers.$inferSelect;
