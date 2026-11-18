import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { TrunkBase, TrunkCreateInput, type Trunk, type TrunkListQuery, type TrunkUpdateInput } from '@voip-manager/shared';
import { vmEndpointMeta } from '../../db/schema/app/index.js';
import { badRequest, conflict, notFound } from '../../services/errors.js';
import { deletePjsipRows, endpointExistsInAsterisk, getAnyMeta, getMeta, listMeta, writePjsipRows } from '../pjsip/store.js';
import { metaToTrunk, trunkToRows } from './mapper.js';

export class TrunkService {
  constructor(private readonly app: FastifyInstance) {}

  private view(meta: NonNullable<Awaited<ReturnType<typeof getMeta>>>): Trunk {
    const reg = this.app.ami.cache.listRegistrations().find((r) => r.registration === meta.endpointId);
    return metaToTrunk(meta, this.app.ami.cache.get(meta.endpointId), reg);
  }

  async list(q: TrunkListQuery): Promise<{ items: Trunk[]; total: number }> {
    const { rows, total } = await listMeta(this.app.db, { ...q, type: 'trunk' });
    return { items: rows.map((r) => this.view(r)), total };
  }

  async get(id: string): Promise<Trunk> {
    const meta = await getMeta(this.app.db, id, 'trunk');
    if (!meta) throw notFound(`Troncal ${id}`);
    return this.view(meta);
  }

  async create(input: TrunkCreateInput, createdBy: string): Promise<Trunk> {
    await this.app.db.transaction(async (tx) => {
      const existing = await getAnyMeta(tx, input.id);
      if (existing && !existing.deletedAt) throw conflict(`Ya existe un endpoint con id ${input.id} (${existing.type})`);
      if (existing?.type === 'extension') throw conflict(`El id ${input.id} pertenece a una extensión eliminada`);
      if (!existing && (await endpointExistsInAsterisk(tx, input.id))) {
        throw conflict(`El id ${input.id} ya existe en ps_endpoints fuera de voip-manager`);
      }
      await writePjsipRows(tx, input.id, trunkToRows(input));
      const values = {
        type: 'trunk' as const,
        displayName: input.id,
        description: input.description ?? null,
        context: input.context,
        mode: input.mode,
        config: input as unknown as Record<string, unknown>,
        snapshot: null,
        createdBy,
        deletedAt: null,
      };
      if (existing) await tx.update(vmEndpointMeta).set(values).where(eq(vmEndpointMeta.endpointId, input.id));
      else await tx.insert(vmEndpointMeta).values({ endpointId: input.id, ...values });
    });
    this.app.ami.requestRefresh();
    return this.get(input.id);
  }

  async update(id: string, patch: TrunkUpdateInput): Promise<Trunk> {
    const meta = await getMeta(this.app.db, id, 'trunk');
    if (!meta) throw notFound(`Troncal ${id}`);
    if (meta.deletedAt) throw badRequest('La troncal está eliminada; restáurala antes de modificarla');
    const merged = TrunkCreateInput.parse({ ...(meta.config as object), ...patch, id });
    await this.app.db.transaction(async (tx) => {
      await writePjsipRows(tx, id, trunkToRows(merged));
      await tx
        .update(vmEndpointMeta)
        .set({ description: merged.description ?? null, context: merged.context, mode: merged.mode, config: merged as unknown as Record<string, unknown> })
        .where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.requestRefresh();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const meta = await getMeta(this.app.db, id, 'trunk');
    if (!meta) throw notFound(`Troncal ${id}`);
    if (meta.deletedAt) return;
    await this.app.db.transaction(async (tx) => {
      await deletePjsipRows(tx, id);
      await tx.update(vmEndpointMeta).set({ snapshot: meta.config, deletedAt: new Date() }).where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.cache.removeEndpoint(id);
    this.app.ami.requestRefresh();
  }

  async restore(id: string): Promise<Trunk> {
    const meta = await getMeta(this.app.db, id, 'trunk');
    if (!meta) throw notFound(`Troncal ${id}`);
    if (!meta.deletedAt) return this.get(id);
    const cfg = TrunkBase.parse({ ...((meta.snapshot ?? meta.config) as object), id });
    await this.app.db.transaction(async (tx) => {
      if (await endpointExistsInAsterisk(tx, id)) throw conflict(`El id ${id} ya existe en ps_endpoints`);
      await writePjsipRows(tx, id, trunkToRows(cfg));
      await tx
        .update(vmEndpointMeta)
        .set({ config: cfg as unknown as Record<string, unknown>, snapshot: null, deletedAt: null })
        .where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.requestRefresh();
    return this.get(id);
  }
}
