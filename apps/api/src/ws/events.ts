import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import type { WsEvent } from '@voip-manager/shared';
import { hasPermission } from '@voip-manager/shared';
import { buildSnapshot } from '../modules/ami/routes.js';

/**
 * GET /ws/events?token=<accessToken>
 * Envía un `snapshot` al conectar y luego eventos incrementales del AMI.
 */
export const eventsWebSocket: FastifyPluginAsync = async (app) => {
  const clients = new Set<WebSocket>();
  const broadcast = (msg: WsEvent) => {
    const payload = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  };

  app.ami.cache.on('endpoint', (data) => broadcast({ type: 'endpoint', data }));
  app.ami.cache.on('registration', (data) => broadcast({ type: 'registration', data }));
  app.ami.on('status', (data) => broadcast({ type: 'ami', data }));
  app.ami.on('presence', (data) => broadcast({ type: 'presence', data }));
  app.ami.calls.on('call', (data) => broadcast({ type: 'call', data }));
  app.ami.calls.on('call-removed', (data) => broadcast({ type: 'call-removed', data }));
  app.ami.on('snapshot', () => {
    if (!clients.size) return;
    void buildSnapshot(app as never).then((data) => broadcast({ type: 'snapshot', data })).catch(() => undefined);
  });

  // Audio desde Asterisk (app_audiofork). No lleva token: la sesión es un UUID efímero creado por la API.
  app.get('/audiofork/:sessionId', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    if (!app.liveListen.attachSource(sessionId, socket)) socket.close(4404, 'Sesión desconocida');
  });

  // Oyentes (navegador). Requiere monitor:execute.
  app.get('/listen/:sessionId', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const token = (req.query as { token?: string }).token;
    try {
      const user = app.verifyAccessToken(token ?? '');
      if (!hasPermission(user.role, 'monitor:execute')) throw new Error('forbidden');
    } catch {
      socket.close(4401, 'No autorizado');
      return;
    }
    if (!app.liveListen.attachListener(sessionId, socket)) socket.close(4404, 'Sesión desconocida');
  });

  app.get('/events', { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    try {
      const user = app.verifyAccessToken(token ?? '');
      if (!hasPermission(user.role, 'ami:read') && !hasPermission(user.role, 'monitor:read')) throw new Error('forbidden');
    } catch {
      socket.close(4401, 'No autorizado');
      return;
    }
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
    socket.on('message', (raw) => {
      // Ping sencillo desde el cliente
      if (raw.toString() === 'ping') socket.send('pong');
    });
    try {
      const data = await buildSnapshot(app as never);
      socket.send(JSON.stringify({ type: 'snapshot', data } satisfies WsEvent));
    } catch (e) {
      req.log.warn({ err: e }, 'No se pudo enviar snapshot inicial');
    }
  });
};
