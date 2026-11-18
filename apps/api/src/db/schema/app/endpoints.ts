import { mysqlTable, varchar, datetime, mysqlEnum, json, index } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

/**
 * Metadatos propios de cada endpoint PJSIP. `ps_endpoints` no distingue extensión de troncal ni
 * soporta borrado lógico, así que se maneja aquí. `config` guarda la forma "amigable" (ExtensionBase /
 * TrunkBase) con la que se generaron las filas ps_*; `snapshot` conserva la última config al eliminar.
 */
export const vmEndpointMeta = mysqlTable(
  'vm_endpoint_meta',
  {
    endpointId: varchar('endpoint_id', { length: 40 }).primaryKey(),
    type: mysqlEnum('type', ['extension', 'trunk']).notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull().default(''),
    description: varchar('description', { length: 255 }),
    context: varchar('context', { length: 40 }).notNull().default(''),
    mode: mysqlEnum('mode', ['ip', 'credentials']),
    config: json('config').$type<Record<string, unknown>>().notNull(),
    snapshot: json('snapshot').$type<Record<string, unknown>>(),
    createdBy: varchar('created_by', { length: 50 }),
    createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdate(() => new Date()),
    deletedAt: datetime('deleted_at', { mode: 'date' }),
  },
  (t) => [index('vm_endpoint_meta_type_idx').on(t.type, t.deletedAt), index('vm_endpoint_meta_ctx_idx').on(t.context)],
);

export const vmQueueMeta = mysqlTable('vm_queue_meta', {
  queueName: varchar('queue_name', { length: 128 }).primaryKey(),
  description: varchar('description', { length: 255 }),
  config: json('config').$type<Record<string, unknown>>().notNull(),
  createdBy: varchar('created_by', { length: 50 }),
  createdAt: datetime('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => new Date()),
});

export type EndpointMetaRow = typeof vmEndpointMeta.$inferSelect;
export type QueueMetaRow = typeof vmQueueMeta.$inferSelect;
