import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ExtensionCreateInput, type Extension, type ExtensionCloneInput, type ExtensionListQuery, type ExtensionSummary,
  type ExtensionUpdateInput,
} from '@voip-manager/shared';
import { vmEndpointMeta } from '../../db/schema/app/index.js';
import { conflict, notFound, badRequest } from '../../services/errors.js';
import { generateSipSecret } from '../../services/password.js';
import {
  deletePjsipRows, endpointExistsInAsterisk, getAnyMeta, getMeta, listMeta, writePjsipRows,
} from '../pjsip/store.js';
import { extensionToRows, metaToExtension, metaToSummary } from './mapper.js';
import { HintsService } from '../../services/hints.service.js';

export class ExtensionService {
  readonly hints: HintsService;
  constructor(private readonly app: FastifyInstance) {
    this.hints = new HintsService(app);
  }

  /** Regenera los hints en extensions.conf; un fallo no debe impedir la operación principal. */
  private async syncHints() {
    try {
      await this.hints.sync(true);
    } catch (e) {
      this.app.log.warn({ err: (e as Error).message }, 'No se pudieron sincronizar los hints BLF');
    }
  }

  private status(id: string) {
    return this.app.ami.cache.get(id);
  }

  async list(q: ExtensionListQuery): Promise<{ items: ExtensionSummary[]; total: number }> {
    const { rows, total } = await listMeta(this.app.db, { ...q, type: 'extension' });
    return { items: rows.map((r) => metaToSummary(r, this.status(r.endpointId))), total };
  }

  async get(id: string): Promise<Extension> {
    const meta = await getMeta(this.app.db, id, 'extension');
    if (!meta) throw notFound(`Extensión ${id}`);
    return metaToExtension(meta, this.status(id));
  }

  async create(input: ExtensionCreateInput, createdBy: string): Promise<Extension> {
    await this.app.db.transaction(async (tx) => {
      const existing = await getAnyMeta(tx, input.id);
      if (existing && !existing.deletedAt) throw conflict(`Ya existe un endpoint con id ${input.id} (${existing.type})`);
      if (existing?.type === 'trunk') throw conflict(`El id ${input.id} pertenece a una troncal eliminada`);
      if (!existing && (await endpointExistsInAsterisk(tx, input.id))) {
        throw conflict(`El id ${input.id} ya existe en ps_endpoints fuera de voip-manager`);
      }
      await writePjsipRows(tx, input.id, extensionToRows(input));
      const metaValues = {
        type: 'extension' as const,
        displayName: input.displayName,
        description: input.description ?? null,
        context: input.context,
        mode: null,
        config: input as unknown as Record<string, unknown>,
        snapshot: null,
        createdBy,
        deletedAt: null,
      };
      if (existing) {
        await tx.update(vmEndpointMeta).set(metaValues).where(eq(vmEndpointMeta.endpointId, input.id));
      } else {
        await tx.insert(vmEndpointMeta).values({ endpointId: input.id, ...metaValues });
      }
    });
    this.app.ami.requestRefresh();
    await this.syncHints();
    return this.get(input.id);
  }

  async update(id: string, patch: ExtensionUpdateInput): Promise<Extension> {
    const meta = await getMeta(this.app.db, id, 'extension');
    if (!meta) throw notFound(`Extensión ${id}`);
    if (meta.deletedAt) throw badRequest('La extensión está eliminada; restáurala antes de modificarla');
    const merged = ExtensionCreateInput.parse({ ...(meta.config as object), ...patch, id });
    await this.app.db.transaction(async (tx) => {
      await writePjsipRows(tx, id, extensionToRows(merged));
      await tx
        .update(vmEndpointMeta)
        .set({
          displayName: merged.displayName,
          description: merged.description ?? null,
          context: merged.context,
          config: merged as unknown as Record<string, unknown>,
        })
        .where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.requestRefresh();
    await this.syncHints();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const meta = await getMeta(this.app.db, id, 'extension');
    if (!meta) throw notFound(`Extensión ${id}`);
    if (meta.deletedAt) return;
    await this.app.db.transaction(async (tx) => {
      await deletePjsipRows(tx, id, { dropMemberships: true });
      await tx
        .update(vmEndpointMeta)
        .set({ snapshot: meta.config, deletedAt: new Date() })
        .where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.cache.removeEndpoint(id);
    this.app.ami.requestRefresh();
    await this.syncHints();
  }

  async restore(id: string): Promise<Extension> {
    const meta = await getMeta(this.app.db, id, 'extension');
    if (!meta) throw notFound(`Extensión ${id}`);
    if (!meta.deletedAt) return this.get(id);
    const cfg = ExtensionCreateInput.parse({ ...((meta.snapshot ?? meta.config) as object), id });
    await this.app.db.transaction(async (tx) => {
      if (await endpointExistsInAsterisk(tx, id)) throw conflict(`El id ${id} ya existe en ps_endpoints`);
      await writePjsipRows(tx, id, extensionToRows(cfg));
      await tx
        .update(vmEndpointMeta)
        .set({ config: cfg as unknown as Record<string, unknown>, snapshot: null, deletedAt: null })
        .where(eq(vmEndpointMeta.endpointId, id));
    });
    this.app.ami.requestRefresh();
    await this.syncHints();
    return this.get(id);
  }

  async clone(sourceId: string, input: ExtensionCloneInput, createdBy: string): Promise<Extension> {
    const source = await getMeta(this.app.db, sourceId, 'extension');
    if (!source) throw notFound(`Extensión ${sourceId}`);
    const src = (source.deletedAt ? (source.snapshot ?? source.config) : source.config) as unknown as ExtensionCreateInput;
    const cfg = ExtensionCreateInput.parse({
      ...src,
      id: input.newId,
      displayName: input.displayName,
      secret: input.secret ?? generateSipSecret(),
      // Si el usuario de autenticación era el propio id, el clon usa su nuevo id.
      authUsername: src.authUsername && src.authUsername !== sourceId ? src.authUsername : undefined,
      mailbox: src.mailbox?.startsWith(`${sourceId}@`) ? src.mailbox.replace(`${sourceId}@`, `${input.newId}@`) : src.mailbox,
      description: src.description ? `${src.description} (clon de ${sourceId})` : `Clon de ${sourceId}`,
    });
    return this.create(cfg, createdBy);
  }
}
