import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ExtensionSummary, OkResponse, Paginated, Queue, QueueCreateInput, QueueListQuery, QueueMember, QueueMemberAddInput,
  QueueMemberUpdateInput, QueueName, QueueUpdateInput,
} from '@voip-manager/shared';
import { QueueService } from './service.js';

const NameParam = z.object({ name: QueueName });
const MemberParam = NameParam.extend({ uniqueid: z.coerce.number().int().positive() });

export const queueRoutes: FastifyPluginAsyncZod = async (app) => {
  const svc = new QueueService(app);
  app.addHook('preHandler', app.authenticate);
  const tags = ['queues'];
  const read = [app.authorize('queues:read')];
  const write = [app.authorize('queues:write')];

  app.get('/', { preHandler: read, schema: { tags, querystring: QueueListQuery, response: { 200: Paginated(Queue) } } }, async (req) => {
    const { items, total } = await svc.list(req.query);
    return { items, total, page: req.query.page, pageSize: req.query.pageSize };
  });
  app.get(
    '/available-extensions',
    { preHandler: read, schema: { tags, querystring: z.object({ name: QueueName }), response: { 200: z.array(ExtensionSummary) } } },
    async (req) => svc.availableExtensions(req.query.name),
  );
  app.post('/', { preHandler: write, schema: { tags, body: QueueCreateInput, response: { 201: Queue } } }, async (req, reply) => {
    const q = await svc.create(req.body, req.user.username);
    await app.audit(req, { action: 'create', resource: 'queues', resourceId: q.name, details: { strategy: q.strategy } });
    return reply.code(201).send(q);
  });
  app.get('/:name', { preHandler: read, schema: { tags, params: NameParam, response: { 200: Queue } } }, async (req) => svc.get(req.params.name));
  app.patch('/:name', { preHandler: write, schema: { tags, params: NameParam, body: QueueUpdateInput, response: { 200: Queue } } }, async (req) => {
    const q = await svc.update(req.params.name, req.body);
    await app.audit(req, { action: 'update', resource: 'queues', resourceId: q.name, details: req.body });
    return q;
  });
  app.delete('/:name', { preHandler: write, schema: { tags, params: NameParam, response: { 200: OkResponse } } }, async (req) => {
    await svc.remove(req.params.name);
    await app.audit(req, { action: 'delete', resource: 'queues', resourceId: req.params.name });
    return { ok: true as const };
  });

  app.get('/:name/members', { preHandler: read, schema: { tags, params: NameParam, response: { 200: z.array(QueueMember) } } }, async (req) =>
    svc.members(req.params.name),
  );
  app.post(
    '/:name/members',
    { preHandler: write, schema: { tags, params: NameParam, body: QueueMemberAddInput, response: { 201: QueueMember } } },
    async (req, reply) => {
      const m = await svc.addMember(req.params.name, req.body);
      await app.audit(req, { action: 'add-member', resource: 'queues', resourceId: req.params.name, details: req.body });
      return reply.code(201).send(m);
    },
  );
  app.patch(
    '/:name/members/:uniqueid',
    { preHandler: write, schema: { tags, params: MemberParam, body: QueueMemberUpdateInput, response: { 200: QueueMember } } },
    async (req) => {
      const m = await svc.updateMember(req.params.name, req.params.uniqueid, req.body);
      await app.audit(req, { action: 'update-member', resource: 'queues', resourceId: req.params.name, details: { ...req.body, interface: m.interface } });
      return m;
    },
  );
  app.delete('/:name/members/:uniqueid', { preHandler: write, schema: { tags, params: MemberParam, response: { 200: OkResponse } } }, async (req) => {
    await svc.removeMember(req.params.name, req.params.uniqueid);
    await app.audit(req, { action: 'remove-member', resource: 'queues', resourceId: req.params.name, details: { uniqueid: req.params.uniqueid } });
    return { ok: true as const };
  });
};
