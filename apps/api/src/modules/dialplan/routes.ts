import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, count, countDistinct, eq, sql } from 'drizzle-orm';
import {
  ContextParam, DialplanBulkInput, DialplanContext, DialplanLine, DialplanLineInput, DialplanLineUpdateInput, NumericIdParam, OkResponse,
} from '@voip-manager/shared';
import { extensions } from '../../db/schema/asterisk/index.js';
import { conflict, notFound } from '../../services/errors.js';

export const dialplanRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.authenticate);
  const tags = ['dialplan'];
  const read = [app.authorize('dialplan:read')];
  const write = [app.authorize('dialplan:write')];
  const reloadDialplan = () => app.ami.reload('dialplan').catch(() => undefined);

  const getLine = async (id: number) => {
    const [row] = await app.db.select().from(extensions).where(eq(extensions.id, id));
    if (!row) throw notFound('Línea de dialplan');
    return row;
  };
  const dupCheck = async (context: string, exten: string, priority: number, excludeId?: number) => {
    const [dup] = await app.db
      .select({ id: extensions.id })
      .from(extensions)
      .where(and(eq(extensions.context, context), eq(extensions.exten, exten), eq(extensions.priority, priority)));
    if (dup && dup.id !== excludeId) throw conflict(`Ya existe ${context},${exten},${priority}`);
  };

  app.get('/contexts', { preHandler: read, schema: { tags, response: { 200: z.array(DialplanContext) } } }, async () => {
    const rows = await app.db
      .select({ context: extensions.context, lines: count(), extens: countDistinct(extensions.exten) })
      .from(extensions)
      .groupBy(extensions.context)
      .orderBy(asc(extensions.context));
    return rows;
  });

  app.get('/contexts/:context', { preHandler: read, schema: { tags, params: ContextParam, response: { 200: z.array(DialplanLine) } } }, async (req) =>
    app.db.select().from(extensions).where(eq(extensions.context, req.params.context)).orderBy(asc(extensions.exten), asc(extensions.priority)),
  );

  app.delete('/contexts/:context', { preHandler: write, schema: { tags, params: ContextParam, response: { 200: OkResponse } } }, async (req) => {
    await app.db.delete(extensions).where(eq(extensions.context, req.params.context));
    await app.audit(req, { action: 'delete-context', resource: 'dialplan', resourceId: req.params.context });
    reloadDialplan();
    return { ok: true as const };
  });

  app.post('/lines', { preHandler: write, schema: { tags, body: DialplanLineInput, response: { 201: DialplanLine } } }, async (req, reply) => {
    await dupCheck(req.body.context, req.body.exten, req.body.priority);
    const [res] = await app.db.insert(extensions).values(req.body);
    await app.audit(req, { action: 'create-line', resource: 'dialplan', resourceId: req.body.context, details: req.body });
    reloadDialplan();
    return reply.code(201).send(await getLine(res.insertId));
  });

  app.patch('/lines/:id', { preHandler: write, schema: { tags, params: NumericIdParam, body: DialplanLineUpdateInput, response: { 200: DialplanLine } } }, async (req) => {
    const current = await getLine(req.params.id);
    const next = { ...current, ...req.body };
    await dupCheck(next.context, next.exten, next.priority, current.id);
    await app.db.update(extensions).set(req.body).where(eq(extensions.id, current.id));
    await app.audit(req, { action: 'update-line', resource: 'dialplan', resourceId: next.context, details: { id: current.id, ...req.body } });
    reloadDialplan();
    return getLine(current.id);
  });

  app.delete('/lines/:id', { preHandler: write, schema: { tags, params: NumericIdParam, response: { 200: OkResponse } } }, async (req) => {
    const line = await getLine(req.params.id);
    await app.db.delete(extensions).where(eq(extensions.id, line.id));
    await app.audit(req, { action: 'delete-line', resource: 'dialplan', resourceId: line.context, details: line });
    reloadDialplan();
    return { ok: true as const };
  });

  app.post('/bulk', { preHandler: write, schema: { tags, body: DialplanBulkInput, response: { 200: z.array(DialplanLine) } } }, async (req) => {
    const { context, replace, lines } = req.body;
    await app.db.transaction(async (tx) => {
      if (replace) {
        await tx.delete(extensions).where(eq(extensions.context, context));
      } else {
        // Reemplaza solo las combinaciones exten/priority que vienen en el lote.
        for (const l of lines) {
          await tx.delete(extensions).where(and(eq(extensions.context, context), eq(extensions.exten, l.exten), eq(extensions.priority, l.priority)));
        }
      }
      await tx.insert(extensions).values(lines.map((l) => ({ ...l, context })));
    });
    await app.audit(req, { action: replace ? 'replace-context' : 'bulk-upsert', resource: 'dialplan', resourceId: context, details: { lines: lines.length } });
    reloadDialplan();
    return app.db.select().from(extensions).where(eq(extensions.context, context)).orderBy(asc(extensions.exten), asc(extensions.priority));
  });

  // Util para la UI: contextos distintos (también usados por extensions.conf generado)
  app.get('/context-names', { preHandler: read, schema: { tags, response: { 200: z.array(z.string()) } } }, async () => {
    const rows = await app.db.selectDistinct({ c: extensions.context }).from(extensions).orderBy(sql`1`);
    return rows.map((r) => r.c);
  });
};
