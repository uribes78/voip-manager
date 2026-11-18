import { EventEmitter } from 'node:events';
import AsteriskManager, { type AmiAction, type AmiEvent, type AmiResponse } from 'asterisk-manager';
import type { FastifyBaseLogger } from 'fastify';
import type {
  AmiStatus, ContactStatus, OriginateInput, OriginateResult, ReloadModule, ReloadResult, RegistrationStatus,
} from '@voip-manager/shared';
import type { Env } from '../config/env.js';
import { StatusCache } from './status-cache.js';
import { asteriskUnavailable } from './errors.js';

type Manager = ReturnType<typeof AsteriskManager>;

export interface AmiConfigCategory {
  name: string;
  lines: Array<{ var: string; value: string }>;
}
export interface AmiConfigAction {
  action: 'NewCat' | 'RenameCat' | 'DelCat' | 'EmptyCat' | 'Update' | 'Delete' | 'Append' | 'Insert';
  cat: string;
  var?: string;
  value?: string;
  options?: string;
}

const RELOAD_COMMANDS: Record<ReloadModule, string[]> = {
  pjsip: [
    'module reload res_pjsip.so',
    'module reload res_pjsip_outbound_registration.so',
    'module reload res_pjsip_endpoint_identifier_ip.so',
  ],
  queues: ['module reload app_queue.so'],
  dialplan: ['dialplan reload'],
  cdr: ['module reload cdr_adaptive_odbc.so'],
  odbc: ['module reload res_odbc.so'],
  musiconhold: ['module reload res_musiconhold.so'],
  all: ['core reload'],
};

const contactStatusName = (s: string | undefined): string => {
  switch ((s ?? '').toLowerCase()) {
    case 'reachable':
    case 'avail':
      return 'Avail';
    case 'unreachable':
    case 'unavail':
      return 'Unavail';
    case 'nonqualified':
      return 'NonQualified';
    case 'created':
      return 'Created';
    case 'removed':
      return 'Removed';
    default:
      return 'Unknown';
  }
};

const rttMs = (usec: string | undefined): number | null => {
  const n = Number(usec);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) : null;
};

/**
 * Sesión AMI persistente. Mantiene `StatusCache` al día con eventos y ofrece acciones
 * (reload, originate, listados). Emite `status` cuando cambia la conexión.
 */
export class AmiService extends EventEmitter {
  readonly cache = new StatusCache();
  private ami: Manager | null = null;
  private status: AmiStatus;
  private refreshTimer: NodeJS.Timeout | null = null;
  private registryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly env: Env,
    private readonly log: FastifyBaseLogger,
  ) {
    super();
    this.status = {
      connected: false,
      host: env.AMI_HOST,
      port: env.AMI_PORT,
      connectedSince: null,
      lastEventAt: null,
      asteriskVersion: null,
      lastError: null,
    };
  }

  getStatus(): AmiStatus {
    return { ...this.status };
  }
  isConnected() {
    return this.status.connected;
  }

  start() {
    if (this.ami) return;
    this.stopped = false;
    const ami = new AsteriskManager(this.env.AMI_PORT, this.env.AMI_HOST, this.env.AMI_USER, this.env.AMI_SECRET, true);
    this.ami = ami;
    if (this.env.AMI_RECONNECT) ami.keepConnected();

    ami.on('connect', () => {
      this.log.info({ host: this.env.AMI_HOST, port: this.env.AMI_PORT }, 'AMI conectado');
      this.status.connected = true;
      this.status.connectedSince = new Date().toISOString();
      this.status.lastError = null;
      this.emitStatus();
      // Pequeña espera para que el login termine antes de pedir listados.
      setTimeout(() => void this.refreshAll().catch((e) => this.log.warn(e, 'refreshAll falló')), 500);
    });
    const onDown = (reason: string) => {
      if (!this.status.connected && !this.status.lastError) return;
      this.log.warn({ reason }, 'AMI desconectado');
      this.status.connected = false;
      this.status.connectedSince = null;
      this.cache.resetChannels();
      this.emitStatus();
    };
    ami.on('close', () => onDown('close'));
    ami.on('end', () => onDown('end'));
    ami.on('disconnect', () => onDown('disconnect'));
    ami.on('error', (err: Error) => {
      this.status.lastError = err.message;
      this.log.error({ err: err.message }, 'Error AMI');
      onDown('error');
    });
    ami.on('managerevent', (evt: AmiEvent) => this.handleEvent(evt));
  }

  async stop() {
    this.stopped = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.registryTimer) clearTimeout(this.registryTimer);
    await new Promise<void>((resolve) => {
      if (!this.ami) return resolve();
      this.ami.disconnect(() => resolve());
      setTimeout(resolve, 1000);
    });
    this.ami = null;
  }

  private emitStatus() {
    this.emit('status', this.getStatus());
  }

  // ---------- Eventos ----------
  private handleEvent(evt: AmiEvent) {
    this.status.lastEventAt = new Date().toISOString();
    const name = (evt.event ?? '').toLowerCase();
    switch (name) {
      case 'devicestatechange': {
        const m = /^PJSIP\/(.+)$/.exec(evt.device ?? '');
        if (m?.[1]) this.cache.setDeviceState(m[1], evt.state ?? 'Unknown');
        break;
      }
      case 'contactstatus': {
        const endpoint = evt.endpointname;
        if (!endpoint) break;
        this.cache.upsertContact(endpoint, {
          uri: evt.uri ?? '',
          status: contactStatusName(evt.contactstatus),
          rtt: rttMs(evt.roundtripusec),
          userAgent: evt.useragent ?? null,
          viaAddress: evt.viaaddress ?? null,
        });
        break;
      }
      case 'registry': {
        if ((evt.channeltype ?? '').toUpperCase() !== 'PJSIP') break;
        // El evento no trae el nombre del objeto; refrescamos el listado con debounce.
        if (this.registryTimer) clearTimeout(this.registryTimer);
        this.registryTimer = setTimeout(() => void this.refreshRegistrations().catch(() => undefined), 300);
        break;
      }
      case 'newchannel':
        if (evt.uniqueid && evt.channel) this.cache.channelUp(evt.uniqueid, evt.channel);
        break;
      case 'hangup':
        if (evt.uniqueid) this.cache.channelDown(evt.uniqueid);
        break;
      case 'fullybooted':
      case 'reload':
        this.scheduleRefresh();
        break;
      default:
        break;
    }
    this.emit('event', evt);
  }

  /** Reprograma una sincronización completa (debounce 1s). Seguro de llamar sin conexión. */
  requestRefresh() {
    if (!this.status.connected) return;
    this.scheduleRefresh();
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refreshAll().catch(() => undefined), 1000);
  }

  // ---------- Acciones ----------
  private requireAmi(): Manager {
    if (!this.ami || !this.status.connected) throw asteriskUnavailable();
    return this.ami;
  }

  action(action: AmiAction, timeoutMs = 10_000): Promise<AmiResponse> {
    const ami = this.requireAmi();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(asteriskUnavailable(`AMI sin respuesta a ${action.action}`)), timeoutMs);
      ami.action(action, (err, res) => {
        clearTimeout(timer);
        if (err) return reject(new Error(err.message ?? `AMI ${action.action} falló`));
        resolve(res);
      });
    });
  }

  /** Ejecuta una acción de tipo lista y devuelve los eventos con el mismo ActionID hasta `*Complete`. */
  actionList(action: AmiAction, timeoutMs = 15_000): Promise<AmiEvent[]> {
    const ami = this.requireAmi();
    return new Promise((resolve, reject) => {
      const events: AmiEvent[] = [];
      let actionId = '';
      const onEvent = (evt: AmiEvent) => {
        if (!actionId || evt.actionid !== actionId) return;
        const ev = (evt.event ?? '').toLowerCase();
        if (ev.endsWith('complete')) {
          cleanup();
          resolve(events);
        } else {
          events.push(evt);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(asteriskUnavailable(`AMI sin respuesta completa a ${action.action}`));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        ami.removeListener('managerevent', onEvent as (...args: unknown[]) => void);
      };
      ami.on('managerevent', onEvent);
      actionId = ami.action(action, (err) => {
        if (err) {
          cleanup();
          // Asterisk responde "Error: No Contacts found" / "No Endpoints found" cuando la lista está vacía.
          if (/^No .* found/i.test(err.message ?? '')) return resolve([]);
          reject(new Error(err.message ?? `AMI ${action.action} falló`));
        }
      });
    });
  }

  async command(command: string): Promise<string> {
    const res = await this.action({ action: 'Command', command });
    const out = (res as Record<string, unknown>).output;
    if (Array.isArray(out)) return out.join('\n');
    if (typeof out === 'string') return out;
    return res.message ?? '';
  }

  async reload(module: ReloadModule): Promise<ReloadResult> {
    this.requireAmi();
    const commands = RELOAD_COMMANDS[module];
    const outputs: string[] = [];
    let ok = true;
    for (const cmd of commands) {
      try {
        outputs.push(`$ ${cmd}\n${await this.command(cmd)}`);
      } catch (e) {
        ok = false;
        outputs.push(`$ ${cmd}\nERROR: ${(e as Error).message}`);
      }
    }
    this.scheduleRefresh();
    return { module, command: commands.join(' && '), response: outputs.join('\n').trim(), ok };
  }

  async originate(input: OriginateInput): Promise<OriginateResult> {
    const action: AmiAction = {
      action: 'Originate',
      channel: `PJSIP/${input.from}`,
      timeout: input.timeout * 1000,
      async: 'true',
      callerid: input.callerId ?? `Prueba <${input.to}>`,
    };
    if (input.playback) {
      action.application = 'Playback';
      action.data = input.playback;
    } else {
      action.exten = input.to;
      action.context = input.context;
      action.priority = 1;
    }
    try {
      const res = await this.action(action, 15_000);
      return {
        actionId: res.actionid ?? '',
        response: res.response ?? 'Unknown',
        message: res.message ?? null,
        ok: (res.response ?? '').toLowerCase() === 'success',
      };
    } catch (e) {
      return { actionId: '', response: 'Error', message: (e as Error).message, ok: false };
    }
  }

  // ---------- Archivos de configuración vía AMI ----------
  /** GetConfig: categorías y líneas (sin comentarios) de un archivo en /etc/asterisk del servidor Asterisk. */
  async getConfig(file: string): Promise<AmiConfigCategory[]> {
    const res = await this.action({ action: 'GetConfig', filename: file }, 15_000);
    const cats = new Map<number, AmiConfigCategory & { order: Map<number, string> }>();
    const ensure = (i: number) => {
      let c = cats.get(i);
      if (!c) {
        c = { name: '', lines: [], order: new Map() };
        cats.set(i, c);
      }
      return c;
    };
    for (const [k, v] of Object.entries(res)) {
      let m = /^category-(\d+)$/.exec(k);
      if (m) ensure(Number(m[1])).name = String(v);
      m = /^line-(\d+)-(\d+)$/.exec(k);
      if (m) ensure(Number(m[1])).order.set(Number(m[2]), String(v));
    }
    return [...cats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => ({
        name: c.name,
        lines: [...c.order.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, raw]) => {
            const eq = raw.indexOf('=');
            return eq < 0 ? { var: raw, value: '' } : { var: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim() };
          }),
      }));
  }

  /** UpdateConfig en lotes. Cada petición carga, modifica y guarda el archivo en el servidor Asterisk. */
  async updateConfig(file: string, actions: AmiConfigAction[], chunkSize = 40): Promise<void> {
    for (let i = 0; i < actions.length; i += chunkSize) {
      const chunk = actions.slice(i, i + chunkSize);
      const payload: AmiAction = { action: 'UpdateConfig', srcfilename: file, dstfilename: file, reload: 'no' };
      chunk.forEach((a, idx) => {
        const n = String(idx).padStart(6, '0');
        payload[`action-${n}`] = a.action;
        payload[`cat-${n}`] = a.cat;
        if (a.var !== undefined) payload[`var-${n}`] = a.var;
        if (a.value !== undefined) payload[`value-${n}`] = a.value.replace(/[\r\n]+/g, ' ');
        if (a.options !== undefined) payload[`options-${n}`] = a.options;
      });
      await this.action(payload, 20_000);
    }
  }

  async fetchVersion(): Promise<string | null> {
    try {
      const res = await this.action({ action: 'CoreSettings' });
      this.status.asteriskVersion = res.asteriskversion ?? null;
      return this.status.asteriskVersion;
    } catch {
      return null;
    }
  }

  // ---------- Sincronización completa ----------
  async refreshAll() {
    if (!this.status.connected) return;
    await this.fetchVersion();
    // Cada paso es independiente: un fallo no debe impedir los demás.
    const steps: Array<[string, () => Promise<void>]> = [
      ['endpoints', () => this.refreshEndpoints()],
      ['contacts', () => this.refreshContacts()],
      ['registrations', () => this.refreshRegistrations()],
      ['channels', () => this.refreshChannels()],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (e) {
        this.log.warn({ step: name, err: (e as Error).message }, 'Paso de sincronización AMI falló');
      }
    }
    this.emit('snapshot');
  }

  async refreshEndpoints() {
    const events = await this.actionList({ action: 'PJSIPShowEndpoints' });
    const seen = new Set<string>();
    for (const e of events) {
      if ((e.event ?? '').toLowerCase() !== 'endpointlist' || !e.objectname) continue;
      seen.add(e.objectname);
      this.cache.setDeviceState(e.objectname, e.devicestate ?? 'Unknown');
    }
    for (const ep of this.cache.list()) if (!seen.has(ep.endpoint)) this.cache.removeEndpoint(ep.endpoint);
  }

  async refreshContacts() {
    const events = await this.actionList({ action: 'PJSIPShowContacts' });
    const byEndpoint = new Map<string, ContactStatus[]>();
    for (const e of events) {
      if ((e.event ?? '').toLowerCase() !== 'contactlist' || !e.endpointname) continue;
      const list = byEndpoint.get(e.endpointname) ?? [];
      list.push({
        uri: e.uri ?? '',
        status: contactStatusName(e.status),
        rtt: rttMs(e.roundtripusec),
        userAgent: e.useragent ?? null,
        viaAddress: e.viaaddr ? `${e.viaaddr}${e.viaport ? ':' + e.viaport : ''}` : null,
      });
      byEndpoint.set(e.endpointname, list);
    }
    for (const ep of this.cache.list()) this.cache.setContacts(ep.endpoint, byEndpoint.get(ep.endpoint) ?? []);
    for (const [endpoint, contacts] of byEndpoint) if (!this.cache.get(endpoint)) this.cache.setContacts(endpoint, contacts);
  }

  async refreshRegistrations() {
    const events = await this.actionList({ action: 'PJSIPShowRegistrationsOutbound' });
    for (const e of events) {
      if ((e.event ?? '').toLowerCase() !== 'outboundregistrationdetail' || !e.objectname) continue;
      const reg: RegistrationStatus = {
        registration: e.objectname,
        status: e.status ?? 'Unknown',
        serverUri: e.serveruri ?? null,
        clientUri: e.clienturi ?? null,
        updatedAt: new Date().toISOString(),
      };
      this.cache.setRegistration(reg);
    }
  }

  async refreshChannels() {
    const events = await this.actionList({ action: 'CoreShowChannels' });
    this.cache.resetChannels();
    for (const e of events) {
      if ((e.event ?? '').toLowerCase() !== 'coreshowchannel' || !e.uniqueid || !e.channel) continue;
      this.cache.channelUp(e.uniqueid, e.channel);
    }
  }
}
