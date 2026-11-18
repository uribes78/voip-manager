import { and, asc, count, eq, inArray, isNull, like, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  QueueCreateInput, type Queue, type QueueMember, type QueueMemberAddInput, type QueueMemberUpdateInput,
  type QueueUpdateInput, type ExtensionSummary, type PaginationQuery,
} from '@voip-manager/shared';
import { vmEndpointMeta, vmQueueMeta } from '../../db/schema/app/index.js';
import { queueMembers, queues } from '../../db/schema/asterisk/index.js';
import { badRequest, conflict, notFound } from '../../services/errors.js';
import { metaToSummary } from '../extensions/mapper.js';

type Tx = Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0];

/** Forma amigable -> fila `queues`. */
function queueToRow(q: QueueCreateInput): Record<string, string | number | null> {
  return {
    name: q.name,
    strategy: q.strategy,
    musiconhold: q.musiconhold,
    context: q.context ?? null,
    timeout: q.timeout,
    retry: q.retry,
    wrapuptime: q.wrapuptime,
    maxlen: q.maxlen,
    servicelevel: q.servicelevel,
    weight: q.weight,
    announce_frequency: q.announceFrequency,
    announce_holdtime: q.announceHoldtime,
    announce_position: q.announcePosition,
    periodic_announce_frequency: q.periodicAnnounceFrequency,
    joinempty: q.joinempty,
    leavewhenempty: q.leavewhenempty,
    ringinuse: q.ringinuse ? 'yes' : 'no',
    autopause: q.autopause,
    reportholdtime: q.reportholdtime,
    timeoutrestart: q.timeoutrestart,
    ...q.advanced,
  };
}

async function replaceQueueRow(tx: Tx, q: QueueCreateInput) {
  const row = queueToRow(q);
  const entries = Object.entries(row).filter(([, v]) => v !== undefined && v !== null && v !== '');
  await tx.execute(sql`DELETE FROM queues WHERE name = ${q.name}`);
  await tx.execute(
    sql`INSERT INTO queues (${sql.join(entries.map(([k]) => sql.identifier(k)), sql`, `)}) VALUES (${sql.join(entries.map(([, v]) => sql`${v}`), sql`, `)})`,
  );
}

export class QueueService {
  constructor(private readonly app: FastifyInstance) {}

  private memberView(m: typeof queueMembers.$inferSelect, names: Map<string, string>): QueueMember {
    const ext = /^PJSIP\/(.+)$/.exec(m.interface)?.[1] ?? null;
    const status = ext ? this.app.ami.cache.get(ext)?.deviceState : undefined;
    return {
      uniqueid: m.uniqueid,
      queueName: m.queue_name,
      interface: m.interface,
      memberName: m.membername ?? null,
      stateInterface: m.state_interface ?? null,
      penalty: m.penalty ?? 0,
      paused: (m.paused ?? 0) === 1,
      extensionId: ext,
      extensionDisplayName: ext ? (names.get(ext) ?? null) : null,
      status,
    };
  }

  private async extensionNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.app.db
      .select({ id: vmEndpointMeta.endpointId, name: vmEndpointMeta.displayName })
      .from(vmEndpointMeta)
      .where(inArray(vmEndpointMeta.endpointId, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async view(name: string, withMembers: boolean): Promise<Queue> {
    const [row] = await this.app.db.select().from(queues).where(eq(queues.name, name));
    if (!row) throw notFound(`Cola ${name}`);
    const [meta] = await this.app.db.select().from(vmQueueMeta).where(eq(vmQueueMeta.queueName, name));
    const cfg = (meta?.config ?? this.rowToConfig(row)) as unknown as QueueCreateInput;
    const memberRows = await this.app.db.select().from(queueMembers).where(eq(queueMembers.queue_name, name)).orderBy(asc(queueMembers.penalty), asc(queueMembers.interface));
    const names = withMembers ? await this.extensionNames(memberRows.map((m) => /^PJSIP\/(.+)$/.exec(m.interface)?.[1] ?? '').filter(Boolean)) : new Map();
    return {
      ...cfg,
      name,
      description: meta?.description ?? cfg.description,
      membersCount: memberRows.length,
      members: withMembers ? memberRows.map((m) => this.memberView(m, names)) : undefined,
      createdAt: meta?.createdAt.toISOString() ?? null,
      updatedAt: meta?.updatedAt.toISOString() ?? null,
    };
  }

  /** Para colas creadas fuera del servicio: reconstruye la config a partir de la fila. */
  private rowToConfig(row: typeof queues.$inferSelect): QueueCreateInput {
    const r = row as Record<string, unknown>;
    return QueueCreateInput.parse({
      name: row.name,
      strategy: row.strategy ?? undefined,
      musiconhold: row.musiconhold ?? undefined,
      context: row.context ?? undefined,
      timeout: row.timeout ?? undefined,
      retry: row.retry ?? undefined,
      wrapuptime: row.wrapuptime ?? undefined,
      maxlen: row.maxlen ?? undefined,
      servicelevel: row.servicelevel ?? undefined,
      weight: row.weight ?? undefined,
      announceFrequency: r.announce_frequency != null ? Number(r.announce_frequency) : undefined,
      announceHoldtime: r.announce_holdtime ?? undefined,
      announcePosition: r.announce_position ?? undefined,
      periodicAnnounceFrequency: r.periodic_announce_frequency != null ? Number(r.periodic_announce_frequency) : undefined,
      joinempty: r.joinempty ?? undefined,
      leavewhenempty: r.leavewhenempty ?? undefined,
      ringinuse: r.ringinuse === 'yes' || r.ringinuse === '1',
      autopause: r.autopause ?? undefined,
      reportholdtime: r.reportholdtime ?? undefined,
      timeoutrestart: r.timeoutrestart ?? undefined,
    });
  }

  async list(q: PaginationQuery): Promise<{ items: Queue[]; total: number }> {
    const where: SQL | undefined = q.search ? like(queues.name, `%${q.search}%`) : undefined;
    const [rows, [total]] = await Promise.all([
      this.app.db.select({ name: queues.name }).from(queues).where(where).orderBy(asc(queues.name)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      this.app.db.select({ c: count() }).from(queues).where(where),
    ]);
    const items = await Promise.all(rows.map((r) => this.view(r.name, false)));
    return { items, total: total?.c ?? 0 };
  }

  get(name: string) {
    return this.view(name, true);
  }

  async create(input: QueueCreateInput, createdBy: string): Promise<Queue> {
    const [dup] = await this.app.db.select({ name: queues.name }).from(queues).where(eq(queues.name, input.name));
    if (dup) throw conflict(`Ya existe la cola ${input.name}`);
    await this.app.db.transaction(async (tx) => {
      await replaceQueueRow(tx, input);
      await tx
        .insert(vmQueueMeta)
        .values({ queueName: input.name, description: input.description ?? null, config: input as unknown as Record<string, unknown>, createdBy })
        .onDuplicateKeyUpdate({ set: { description: input.description ?? null, config: input as unknown as Record<string, unknown> } });
    });
    this.app.ami.reload('queues').catch(() => undefined);
    return this.get(input.name);
  }

  async update(name: string, patch: QueueUpdateInput): Promise<Queue> {
    const current = await this.view(name, false);
    const { membersCount, members, createdAt, updatedAt, ...cfg } = current;
    const merged = QueueCreateInput.parse({ ...cfg, ...patch, name });
    await this.app.db.transaction(async (tx) => {
      await replaceQueueRow(tx, merged);
      await tx
        .insert(vmQueueMeta)
        .values({ queueName: name, description: merged.description ?? null, config: merged as unknown as Record<string, unknown> })
        .onDuplicateKeyUpdate({ set: { description: merged.description ?? null, config: merged as unknown as Record<string, unknown> } });
    });
    this.app.ami.reload('queues').catch(() => undefined);
    return this.get(name);
  }

  async remove(name: string): Promise<void> {
    await this.view(name, false);
    await this.app.db.transaction(async (tx) => {
      await tx.delete(queueMembers).where(eq(queueMembers.queue_name, name));
      await tx.delete(queues).where(eq(queues.name, name));
      await tx.delete(vmQueueMeta).where(eq(vmQueueMeta.queueName, name));
    });
    this.app.ami.reload('queues').catch(() => undefined);
  }

  // ---------- Miembros ----------
  async members(name: string): Promise<QueueMember[]> {
    return (await this.view(name, true)).members ?? [];
  }

  async availableExtensions(name: string): Promise<ExtensionSummary[]> {
    const used = (await this.app.db.select({ i: queueMembers.interface }).from(queueMembers).where(eq(queueMembers.queue_name, name))).map((m) => m.i.replace(/^PJSIP\//, ''));
    const rows = await this.app.db
      .select()
      .from(vmEndpointMeta)
      .where(and(eq(vmEndpointMeta.type, 'extension'), isNull(vmEndpointMeta.deletedAt), used.length ? notInArray(vmEndpointMeta.endpointId, used) : undefined))
      .orderBy(asc(vmEndpointMeta.endpointId));
    return rows.map((r) => metaToSummary(r, this.app.ami.cache.get(r.endpointId)));
  }

  async addMember(name: string, input: QueueMemberAddInput): Promise<QueueMember> {
    await this.view(name, false);
    const [ext] = await this.app.db
      .select()
      .from(vmEndpointMeta)
      .where(and(eq(vmEndpointMeta.endpointId, input.extensionId), eq(vmEndpointMeta.type, 'extension'), isNull(vmEndpointMeta.deletedAt)));
    if (!ext) throw badRequest(`La extensión ${input.extensionId} no existe o está eliminada`);
    const iface = `PJSIP/${input.extensionId}`;
    const [dup] = await this.app.db.select({ id: queueMembers.uniqueid }).from(queueMembers).where(and(eq(queueMembers.queue_name, name), eq(queueMembers.interface, iface)));
    if (dup) throw conflict(`La extensión ${input.extensionId} ya es miembro de ${name}`);
    const [res] = await this.app.db.insert(queueMembers).values({
      queue_name: name,
      interface: iface,
      membername: ext.displayName,
      state_interface: iface,
      penalty: input.penalty,
      paused: input.paused ? 1 : 0,
    });
    this.app.ami.reload('queues').catch(() => undefined);
    return (await this.members(name)).find((m) => m.uniqueid === res.insertId)!;
  }

  async updateMember(name: string, uniqueid: number, patch: QueueMemberUpdateInput): Promise<QueueMember> {
    const [m] = await this.app.db.select().from(queueMembers).where(and(eq(queueMembers.uniqueid, uniqueid), eq(queueMembers.queue_name, name)));
    if (!m) throw notFound('Miembro');
    await this.app.db
      .update(queueMembers)
      .set({ ...(patch.penalty !== undefined ? { penalty: patch.penalty } : {}), ...(patch.paused !== undefined ? { paused: patch.paused ? 1 : 0 } : {}) })
      .where(eq(queueMembers.uniqueid, uniqueid));
    if (patch.paused !== undefined && this.app.ami.isConnected()) {
      this.app.ami.action({ action: 'QueuePause', interface: m.interface, queue: name, paused: patch.paused ? 'true' : 'false' }).catch(() => undefined);
    } else {
      this.app.ami.reload('queues').catch(() => undefined);
    }
    return (await this.members(name)).find((x) => x.uniqueid === uniqueid)!;
  }

  async removeMember(name: string, uniqueid: number): Promise<void> {
    const [m] = await this.app.db.select().from(queueMembers).where(and(eq(queueMembers.uniqueid, uniqueid), eq(queueMembers.queue_name, name)));
    if (!m) throw notFound('Miembro');
    await this.app.db.delete(queueMembers).where(eq(queueMembers.uniqueid, uniqueid));
    this.app.ami.reload('queues').catch(() => undefined);
  }
}

export const queueSearch = (s?: string) => (s ? or(like(queues.name, `%${s}%`)) : undefined);
