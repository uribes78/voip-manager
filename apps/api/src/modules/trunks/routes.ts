import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { IdParam, OkResponse, Paginated, Trunk, TrunkCreateInput, TrunkListQuery, TrunkUpdateInput } from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { TrunkService } from './service.js';

export const trunkRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app) => {
  const svc = new TrunkService(app);
  app.addHook('preHandler', app.authenticate);
  const tags = ['trunks'];

  app.get(
    '/',
    { preHandler: [app.authorize('trunks:read')], schema: { tags, querystring: TrunkListQuery, response: { 200: Paginated(Trunk) } } },
    async (req) => {
      const { items, total } = await svc.list(req.query);
      return { items, total, page: req.query.page, pageSize: req.query.pageSize };
    },
  );
  app.post(
    '/',
    { preHandler: [app.authorize('trunks:write')], schema: { tags, body: TrunkCreateInput, response: { 201: Trunk } } },
    async (req, reply) => {
      const t = await svc.create(req.body, req.user.username);
      await app.audit(req, { action: 'create', resource: 'trunks', resourceId: t.id, details: { mode: t.mode, host: t.host } });
      return reply.code(201).send(t);
    },
  );
  app.get('/:id', { preHandler: [app.authorize('trunks:read')], schema: { tags, params: IdParam, response: { 200: Trunk } } }, async (req) =>
    svc.get(req.params.id),
  );
  app.patch(
    '/:id',
    { preHandler: [app.authorize('trunks:write')], schema: { tags, params: IdParam, body: TrunkUpdateInput, response: { 200: Trunk } } },
    async (req) => {
      const t = await svc.update(req.params.id, req.body);
      const { secret, advanced, ...safe } = req.body;
      await app.audit(req, { action: 'update', resource: 'trunks', resourceId: t.id, details: { ...safe, secret: secret ? '***' : undefined, advanced: advanced ? Object.keys(advanced) : undefined } });
      return t;
    },
  );
  app.delete(
    '/:id',
    { preHandler: [app.authorize('trunks:write')], schema: { tags, params: IdParam, response: { 200: OkResponse } } },
    async (req) => {
      await svc.remove(req.params.id);
      await app.audit(req, { action: 'delete', resource: 'trunks', resourceId: req.params.id });
      return { ok: true as const };
    },
  );
  app.post(
    '/:id/restore',
    { preHandler: [app.authorize('trunks:write')], schema: { tags, params: IdParam, response: { 200: Trunk } } },
    async (req) => {
      const t = await svc.restore(req.params.id);
      await app.audit(req, { action: 'restore', resource: 'trunks', resourceId: t.id });
      return t;
    },
  );
};
