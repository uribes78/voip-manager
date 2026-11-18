import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  EndpointStatus, Extension, ExtensionCloneInput, ExtensionCreateInput, ExtensionListQuery, ExtensionSummary,
  ExtensionUpdateInput, IdParam, OkResponse, Paginated,
} from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { ExtensionService } from './service.js';
import { PresenceService } from '../../services/hints.service.js';
import { HintsSyncResult, PresenceInfo, SetPresenceInput } from '@voip-manager/shared';

export const extensionRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app) => {
  const svc = new ExtensionService(app);
  const presence = new PresenceService(app);
  app.addHook('preHandler', app.authenticate);
  const tags = ['extensions'];

  app.post('/hints/sync', { preHandler: [app.authorize('extensions:write')], schema: { tags, response: { 200: HintsSyncResult } } }, async (req) => {
    const r = await svc.hints.sync(true);
    await app.audit(req, { action: 'sync-hints', resource: 'extensions', resourceId: r.file, details: r.contexts });
    return r;
  });

  app.get('/:id/presence', { preHandler: [app.authorize('extensions:read')], schema: { tags, params: IdParam, response: { 200: PresenceInfo } } }, async (req) => {
    await svc.get(req.params.id);
    return presence.get(req.params.id);
  });

  app.put('/:id/presence', { preHandler: [app.authorize('extensions:write')], schema: { tags, params: IdParam, body: SetPresenceInput, response: { 200: PresenceInfo } } }, async (req) => {
    await svc.get(req.params.id);
    const r = await presence.set(req.params.id, req.body);
    await app.audit(req, { action: 'set-presence', resource: 'extensions', resourceId: req.params.id, details: req.body });
    return r;
  });

  app.get(
    '/',
    { preHandler: [app.authorize('extensions:read')], schema: { tags, querystring: ExtensionListQuery, response: { 200: Paginated(ExtensionSummary) } } },
    async (req) => {
      const { items, total } = await svc.list(req.query);
      return { items, total, page: req.query.page, pageSize: req.query.pageSize };
    },
  );

  app.post(
    '/',
    { preHandler: [app.authorize('extensions:write')], schema: { tags, body: ExtensionCreateInput, response: { 201: Extension } } },
    async (req, reply) => {
      const ext = await svc.create(req.body, req.user.username);
      await app.audit(req, { action: 'create', resource: 'extensions', resourceId: ext.id, details: { context: ext.context } });
      return reply.code(201).send(ext);
    },
  );

  app.get(
    '/:id',
    { preHandler: [app.authorize('extensions:read')], schema: { tags, params: IdParam, response: { 200: Extension } } },
    async (req) => svc.get(req.params.id),
  );

  app.get(
    '/:id/status',
    { preHandler: [app.authorize('extensions:read')], schema: { tags, params: IdParam, response: { 200: EndpointStatus } } },
    async (req) => {
      await svc.get(req.params.id);
      return (
        app.ami.cache.get(req.params.id) ?? {
          endpoint: req.params.id,
          type: 'extension' as const,
          deviceState: 'Unknown',
          online: false,
          contacts: [],
          activeChannels: 0,
          updatedAt: new Date().toISOString(),
        }
      );
    },
  );

  app.patch(
    '/:id',
    { preHandler: [app.authorize('extensions:write')], schema: { tags, params: IdParam, body: ExtensionUpdateInput, response: { 200: Extension } } },
    async (req) => {
      const ext = await svc.update(req.params.id, req.body);
      const { secret, advanced, ...safe } = req.body;
      await app.audit(req, { action: 'update', resource: 'extensions', resourceId: ext.id, details: { ...safe, secret: secret ? '***' : undefined, advanced: advanced ? Object.keys(advanced) : undefined } });
      return ext;
    },
  );

  app.delete(
    '/:id',
    { preHandler: [app.authorize('extensions:write')], schema: { tags, params: IdParam, response: { 200: OkResponse } } },
    async (req) => {
      await svc.remove(req.params.id);
      await app.audit(req, { action: 'delete', resource: 'extensions', resourceId: req.params.id });
      return { ok: true as const };
    },
  );

  app.post(
    '/:id/clone',
    { preHandler: [app.authorize('extensions:write')], schema: { tags, params: IdParam, body: ExtensionCloneInput, response: { 201: Extension } } },
    async (req, reply) => {
      const ext = await svc.clone(req.params.id, req.body, req.user.username);
      await app.audit(req, { action: 'clone', resource: 'extensions', resourceId: ext.id, details: { source: req.params.id } });
      return reply.code(201).send(ext);
    },
  );

  app.post(
    '/:id/restore',
    { preHandler: [app.authorize('extensions:write')], schema: { tags, params: IdParam, response: { 200: Extension } } },
    async (req) => {
      const ext = await svc.restore(req.params.id);
      await app.audit(req, { action: 'restore', resource: 'extensions', resourceId: ext.id });
      return ext;
    },
  );
};
