import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CallIdParam, HangupInput, ListenSession, ListenStartInput, MonitorCapabilities, MonitorSnapshot, OkResponse } from '@voip-manager/shared';
import type { Env } from '../../config/env.js';
import { badRequest, notFound } from '../../services/errors.js';

export const monitorRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (app, { env }) => {
  app.addHook('preHandler', app.authenticate);
  const tags = ['monitor'];
  const read = [app.authorize('monitor:read')];
  const exec = [app.authorize('monitor:execute')];

  app.get('/calls', { preHandler: read, schema: { tags, response: { 200: MonitorSnapshot } } }, async () => {
    const calls = app.ami.calls.list();
    return { calls, active: calls.filter((c) => c.state !== 'ended').length, updatedAt: new Date().toISOString() };
  });

  app.get('/capabilities', { preHandler: read, schema: { tags, response: { 200: MonitorCapabilities } } }, async () => {
    let audiofork = false;
    if (app.ami.isConnected()) {
      try {
        audiofork = /app_audiofork\.so/.test(await app.ami.command('module show like audiofork'));
      } catch {
        audiofork = false;
      }
    }
    return { audiofork, publicWsUrl: env.PUBLIC_WS_URL ?? `ws://127.0.0.1:${env.PORT}` };
  });

  app.post('/calls/:id/hangup', { preHandler: exec, schema: { tags, params: CallIdParam, body: HangupInput, response: { 200: z.object({ ok: z.literal(true), channels: z.array(z.string()) }) } } }, async (req) => {
    const call = app.ami.calls.get(req.params.id);
    if (!call) throw notFound('Llamada');
    const real = call.channels.filter((c) => !c.startsWith('Local/'));
    const channels = req.body.channel ? [req.body.channel] : real.length ? real : call.channels;
    if (req.body.channel && !call.channels.includes(req.body.channel)) throw badRequest('El canal no pertenece a esta llamada');
    for (const channel of channels) {
      await app.ami.action({ action: 'Hangup', channel, cause: req.body.cause }).catch((e) => app.log.warn({ channel, err: (e as Error).message }, 'Hangup falló'));
    }
    await app.audit(req, { action: 'hangup', resource: 'monitor', resourceId: call.id, details: { channels, caller: call.caller.number, callee: call.callee.number } });
    return { ok: true as const, channels };
  });

  app.post('/calls/:id/listen', { preHandler: exec, schema: { tags, params: CallIdParam, body: ListenStartInput, response: { 200: ListenSession } } }, async (req) => {
    const call = app.ami.calls.get(req.params.id);
    if (!call) throw notFound('Llamada');
    const channel = req.body.channel ?? call.caller.channel ?? call.channels.find((c) => !c.startsWith('Local/'));
    if (!channel) throw badRequest('La llamada no tiene un canal que escuchar');
    if (!call.channels.includes(channel)) throw badRequest('El canal no pertenece a esta llamada');
    const session = await app.liveListen.start(call.id, channel, req.body.direction);
    await app.audit(req, { action: 'listen', resource: 'monitor', resourceId: call.id, details: { channel, sessionId: session.sessionId } });
    return session;
  });

  app.get('/listen', { preHandler: exec, schema: { tags, response: { 200: z.array(ListenSession) } } }, async () => app.liveListen.list());

  app.delete('/listen/:sessionId', { preHandler: exec, schema: { tags, params: z.object({ sessionId: z.string().uuid() }), response: { 200: OkResponse } } }, async (req) => {
    await app.liveListen.stop(req.params.sessionId);
    return { ok: true as const };
  });
};
