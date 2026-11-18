import { and, eq, isNull, like, or, count, desc, type SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { MySqlTransaction } from 'drizzle-orm/mysql-core';
import type { Db } from '../../db/client.js';
import { vmEndpointMeta, type EndpointMetaRow } from '../../db/schema/app/index.js';
import { queueMembers } from '../../db/schema/asterisk/index.js';

export type Row = Record<string, string | number | null | undefined>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = MySqlTransaction<any, any, any, any>;

export interface PjsipRows {
  endpoint: Row;
  aor: Row;
  auth?: Row;
  identify?: Row;
  registration?: Row;
}

const TABLES = {
  endpoint: 'ps_endpoints',
  aor: 'ps_aors',
  auth: 'ps_auths',
  identify: 'ps_endpoint_id_ips',
  registration: 'ps_registrations',
} as const;

/** Inserta una fila con columnas dinámicas (las columnas ya vienen validadas contra lista blanca). */
async function insertRow(tx: Tx, table: string, row: Row) {
  const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return;
  const cols = sql.join(entries.map(([k]) => sql.identifier(k)), sql`, `);
  const vals = sql.join(entries.map(([, v]) => sql`${v}`), sql`, `);
  await tx.execute(sql`INSERT INTO ${sql.identifier(table)} (${cols}) VALUES (${vals})`);
}

/** Borra las filas realtime de un endpoint en todas las tablas ps_* (idempotente). */
export async function deletePjsipRows(tx: Tx, id: string, opts: { dropMemberships?: boolean } = {}) {
  for (const t of Object.values(TABLES)) {
    await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE id = ${id}`);
  }
  await tx.execute(sql`DELETE FROM ps_contacts WHERE endpoint = ${id}`);
  if (opts.dropMemberships) {
    await tx.delete(queueMembers).where(eq(queueMembers.interface, `PJSIP/${id}`));
  }
}

/** Reemplaza (borra + inserta) las filas realtime de un endpoint. */
export async function writePjsipRows(tx: Tx, id: string, rows: PjsipRows) {
  await deletePjsipRows(tx, id);
  await insertRow(tx, TABLES.endpoint, { ...rows.endpoint, id });
  await insertRow(tx, TABLES.aor, { ...rows.aor, id });
  if (rows.auth) await insertRow(tx, TABLES.auth, { ...rows.auth, id });
  if (rows.identify) await insertRow(tx, TABLES.identify, { ...rows.identify, id });
  if (rows.registration) await insertRow(tx, TABLES.registration, { ...rows.registration, id });
}

export async function endpointExistsInAsterisk(db: Db | Tx, id: string): Promise<boolean> {
  const [rows] = await db.execute(sql`SELECT COUNT(*) AS c FROM ps_endpoints WHERE id = ${id}`);
  return Number((rows as unknown as Array<{ c: number | string }>)[0]?.c ?? 0) > 0;
}

// ---------- Metadatos ----------
export async function getMeta(db: Db | Tx, id: string, type: 'extension' | 'trunk'): Promise<EndpointMetaRow | undefined> {
  const [row] = await db
    .select()
    .from(vmEndpointMeta)
    .where(and(eq(vmEndpointMeta.endpointId, id), eq(vmEndpointMeta.type, type)));
  return row;
}

export async function getAnyMeta(db: Db | Tx, id: string): Promise<EndpointMetaRow | undefined> {
  const [row] = await db.select().from(vmEndpointMeta).where(eq(vmEndpointMeta.endpointId, id));
  return row;
}

export interface MetaListQuery {
  type: 'extension' | 'trunk';
  page: number;
  pageSize: number;
  search?: string;
  context?: string;
  includeDeleted: boolean;
}

export async function listMeta(db: Db, q: MetaListQuery): Promise<{ rows: EndpointMetaRow[]; total: number }> {
  const conds: SQL[] = [eq(vmEndpointMeta.type, q.type)];
  if (!q.includeDeleted) conds.push(isNull(vmEndpointMeta.deletedAt));
  if (q.context) conds.push(eq(vmEndpointMeta.context, q.context));
  if (q.search) {
    const s = `%${q.search}%`;
    conds.push(or(like(vmEndpointMeta.endpointId, s), like(vmEndpointMeta.displayName, s), like(vmEndpointMeta.description, s))!);
  }
  const where = and(...conds);
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(vmEndpointMeta)
      .where(where)
      .orderBy(desc(sql`${vmEndpointMeta.deletedAt} IS NULL`), vmEndpointMeta.endpointId)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ c: count() }).from(vmEndpointMeta).where(where),
  ]);
  return { rows, total: total?.c ?? 0 };
}

export async function listActiveExtensionIds(db: Db): Promise<Array<{ id: string; displayName: string }>> {
  return db
    .select({ id: vmEndpointMeta.endpointId, displayName: vmEndpointMeta.displayName })
    .from(vmEndpointMeta)
    .where(and(eq(vmEndpointMeta.type, 'extension'), isNull(vmEndpointMeta.deletedAt)))
    .orderBy(vmEndpointMeta.endpointId);
}

export const yn = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'yes' : 'no');
