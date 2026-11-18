import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { FastifyInstance } from 'fastify';
import type { ListenSession } from '@voip-manager/shared';
import { asteriskUnavailable, badRequest, notFound } from './errors.js';

interface Session {
  id: string;
  callId: string;
  channel: string;
  startedAt: Date;
  forkActive: boolean;
  source: WebSocket | null;
  listeners: Set<WebSocket>;
  metadata: string | null;
  idleTimer: NodeJS.Timeout | null;
}

/**
 * Escucha en vivo: pide a Asterisk (app_audiofork, acción AMI AudioFork) que envíe el audio del canal a
 * /ws/audiofork/:session y lo reenvía a los navegadores conectados a /ws/listen/:session.
 */
export class ListenService {
  private sessions = new Map<string, Session>();
  private byChannel = new Map<string, string>();
  /** Tiempo sin oyentes antes de detener el fork. */
  idleMs = 15_000;

  constructor(private readonly app: FastifyInstance) {}

  private publicWsUrl(): string {
    const env = this.app.env;
    return (env.PUBLIC_WS_URL ?? `ws://127.0.0.1:${env.PORT}`).replace(/\/+$/, '');
  }

  listenerCount(callId: string): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.callId === callId) n += s.listeners.size;
    return n;
  }

  toPublic(s: Session): ListenSession {
    return {
      sessionId: s.id,
      callId: s.callId,
      channel: s.channel,
      wsPath: `/ws/listen/${s.id}`,
      codec: 'slin',
      sampleRate: 8000,
      startedAt: s.startedAt.toISOString(),
      forkActive: s.forkActive,
    };
  }

  async start(callId: string, channel: string, direction: 'in' | 'out' | 'both'): Promise<ListenSession> {
    if (!this.app.ami.isConnected()) throw asteriskUnavailable();
    const existing = this.byChannel.get(channel);
    if (existing && this.sessions.has(existing)) return this.toPublic(this.sessions.get(existing)!);
    const id = randomUUID();
    const session: Session = { id, callId, channel, startedAt: new Date(), forkActive: false, source: null, listeners: new Set(), metadata: null, idleTimer: null };
    this.sessions.set(id, session);
    this.byChannel.set(channel, id);
    try {
      const res = await this.app.ami.action({
        action: 'AudioFork',
        channel,
        wsserver: `${this.publicWsUrl()}/ws/audiofork/${id}`,
        options: `c(SLIN)L(8000)D(${direction})s(audioraw)M`, // el subprotocolo debe ser un token RFC 6455 (sin '/')
      });
      if ((res.response ?? '').toLowerCase() === 'error') throw new Error(res.message ?? 'AudioFork falló');
    } catch (e) {
      this.sessions.delete(id);
      this.byChannel.delete(channel);
      const msg = (e as Error).message;
      if (/no such action|invalid\/unknown command/i.test(msg)) {
        throw badRequest('Asterisk no tiene cargado app_audiofork.so (acción AMI AudioFork). Instala el módulo para escuchar en vivo.');
      }
      throw badRequest(`No se pudo iniciar la escucha: ${msg}`);
    }
    this.armIdle(session);
    return this.toPublic(session);
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) throw notFound('Sesión de escucha');
    await this.teardown(s);
  }

  private async teardown(s: Session) {
    if (s.idleTimer) clearTimeout(s.idleTimer);
    this.sessions.delete(s.id);
    if (this.byChannel.get(s.channel) === s.id) this.byChannel.delete(s.channel);
    for (const ws of s.listeners) ws.close(1000, 'Sesión terminada');
    s.listeners.clear();
    s.source?.close(1000, 'Sesión terminada');
    if (this.app.ami.isConnected()) {
      await this.app.ami.action({ action: 'StopAudioFork', channel: s.channel }).catch(() => undefined);
    }
  }

  private armIdle(s: Session) {
    if (s.idleTimer) clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(() => {
      if (s.listeners.size === 0) void this.teardown(s);
    }, this.idleMs);
  }

  /** Conexión entrante de Asterisk con el audio. */
  attachSource(sessionId: string, ws: WebSocket): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.source = ws;
    s.forkActive = true;
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        s.metadata = data.toString();
        for (const l of s.listeners) if (l.readyState === l.OPEN) l.send(s.metadata);
        return;
      }
      for (const l of s.listeners) if (l.readyState === l.OPEN) l.send(data, { binary: true });
    });
    ws.on('close', () => {
      s.forkActive = false;
      s.source = null;
      for (const l of s.listeners) if (l.readyState === l.OPEN) l.send(JSON.stringify({ event: 'fork-ended' }));
      // Si Asterisk cerró (la llamada terminó), limpiamos.
      void this.teardown(s);
    });
    return true;
  }

  /** Conexión de un navegador que quiere oír. */
  attachListener(sessionId: string, ws: WebSocket): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.listeners.add(ws);
    if (s.idleTimer) clearTimeout(s.idleTimer);
    if (s.metadata) ws.send(s.metadata);
    ws.send(JSON.stringify({ event: 'ready', forkActive: s.forkActive, codec: 'slin', sampleRate: 8000 }));
    ws.on('close', () => {
      s.listeners.delete(ws);
      if (s.listeners.size === 0) this.armIdle(s);
    });
    return true;
  }

  /** Limpia sesiones cuando la llamada termina. */
  async endCall(callId: string) {
    for (const s of [...this.sessions.values()]) if (s.callId === callId) await this.teardown(s);
  }

  list(): ListenSession[] {
    return [...this.sessions.values()].map((s) => this.toPublic(s));
  }
}
