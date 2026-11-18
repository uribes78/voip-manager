import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, count, eq, isNull } from 'drizzle-orm';
import {
  AmiStatus, DashboardSnapshot, EndpointStatus, OriginateInput, OriginateResult, ReloadInput, ReloadResult,
} from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { vmEndpointMeta } from '../../db/schema/app/index.js';
import { queues } from '../../db/schema/asterisk/index.js';
import { badRequest } from '../../services/errors.js';
import { getMeta } from '../pjsip/store.js';

export async function buildSnapshot(app: Parameters<FastifyPluginAsyncZod>[0]): Promise<DashboardSnapshot> {
  const [[exts], [trunks], [qs]] = await Promise.all([
    app.db.select({ c: count() }).from(vmEndpointMeta).where(and(eq(vmEndpointMeta.type, 'extension'), isNull(vmEndpointMeta.deletedAt))),
    app.db.select({ c: count() }).from(vmEndpointMeta).where(and(eq(vmEndpointMeta.type, 'trunk'), isNull(vmEndpointMeta.deletedAt))),
    app.db.select({ c: count() }).from(queues).catch(() => [{ c: 0 }]),
  ]);
  const endpoints = app.ami.cache.list();
  const registrations = app.ami.cache.listRegistrations();
  const onlineTrunks = endpoints.filter((e) => e.type === 'trunk' && e.online).length
    + registrations.filter((r) => r.status === 'Registered' && !endpoints.some((e) => e.endpoint === r.registration && e.online)).length;
  return {
    ami: app.ami.getStatus(),
    endpoints,
    registrations,
    kpi: {
      totalExtensions: exts?.c ?? 0,
      onlineExtensions: endpoints.filter((e) => e.type === 'extension' && e.online).length,
      totalTrunks: trunks?.c ?? 0,
      onlineTrunks,
      activeCalls: app.ami.cache.activeCalls(),
      queues: qs?.c ?? 0,
    },
  };
}

export const amiRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const tags = ['ami'];

  // El cache necesita saber qué endpoints son troncales para el dashboard.
  const refreshTypes = async () => {
    const rows = await app.db.select({ id: vmEndpointMeta.endpointId, type: vmEndpointMeta.type }).from(vmEndpointMeta).where(isNull(vmEndpointMeta.deletedAt));
    const map = new Map(rows.map((r) => [r.id, r.type]));
    app.ami.cache.setTypeResolver((id) => map.get(id) ?? 'unknown');
  };
  app.addHook('onReady', async () => {
    await refreshTypes().catch((e) => app.log.warn({ err: e }, 'No se pudieron cargar tipos de endpoint'));
    app.ami.on('snapshot', () => void refreshTypes().catch(() => undefined));
  });

  app.get('/status', { preHandler: [app.authorize('ami:read')], schema: { tags, response: { 200: AmiStatus } } }, async () => app.ami.getStatus());

  app.get('/dashboard', { preHandler: [app.authorize('ami:read')], schema: { tags, response: { 200: DashboardSnapshot } } }, async () => {
    await refreshTypes();
    return buildSnapshot(app);
  });

  app.get('/endpoints', { preHandler: [app.authorize('ami:read')], schema: { tags, response: { 200: z.array(EndpointStatus) } } }, async () =>
    app.ami.cache.list(),
  );

  app.post('/refresh', { preHandler: [app.authorize('ami:read')], schema: { tags, response: { 200: DashboardSnapshot } } }, async () => {
    await app.ami.refreshAll();
    await refreshTypes();
    return buildSnapshot(app);
  });

  app.post('/reload', { preHandler: [app.authorize('ami:execute')], schema: { tags, body: ReloadInput, response: { 200: ReloadResult } } }, async (req) => {
    const result = await app.ami.reload(req.body.module);
    await app.audit(req, { action: 'reload', resource: 'ami', resourceId: req.body.module, details: { ok: result.ok } });
    return result;
  });

  app.post('/originate', { preHandler: [app.authorize('ami:execute')], schema: { tags, body: OriginateInput, response: { 200: OriginateResult } } }, async (req) => {
    const ext = await getMeta(app.db, req.body.from, 'extension');
    if (!ext || ext.deletedAt) throw badRequest(`La extensión origen ${req.body.from} no existe o está eliminada`);
    const result = await app.ami.originate(req.body);
    await app.audit(req, { action: 'originate', resource: 'ami', resourceId: req.body.from, details: { to: req.body.to, context: req.body.context, ok: result.ok, response: result.response } });
    return result;
  });
};
