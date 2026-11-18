import { EventEmitter } from 'node:events';
import type { AmiEvent } from 'asterisk-manager';
import type { LiveCall, LiveCallParty } from '@voip-manager/shared';

type PartyType = LiveCallParty['type'];

interface Chan {
  name: string;
  uniqueid: string;
  linkedid: string;
  state: string;
  callerNum: string | null;
  callerName: string | null;
  connectedNum: string | null;
  connectedName: string | null;
  exten: string | null;
  context: string | null;
  app: string | null;
  appData: string | null;
  createdAt: number;
  onHold: boolean;
  bridged: boolean;
}

interface CallRec {
  id: string;
  callerId: string; // uniqueid del canal que origina
  calleeId: string | null;
  dialed: string | null;
  context: string | null;
  application: string | null;
  queue: string | null;
  startedAt: number;
  ringingAt: number | null;
  answeredAt: number | null;
  endedAt: number | null;
  removeTimer: NodeJS.Timeout | null;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const sec = (from: number | null, to: number | null) => (from === null || to === null ? 0 : Math.max(0, Math.round((to - from) / 1000)));

/** Duración "HH:MM:SS" de CoreShowChannel a milisegundos. */
const parseDuration = (d: string | undefined): number => {
  const m = /^(\d+):(\d+):(\d+)$/.exec(d ?? '');
  return m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 : 0;
};

/**
 * Reconstruye las llamadas activas a partir de eventos AMI (agrupadas por Linkedid).
 * Emite `call` (upsert) y `call-removed`.
 */
export class CallTracker extends EventEmitter {
  private channels = new Map<string, Chan>();
  private calls = new Map<string, CallRec>();
  private typeResolver: (endpoint: string) => 'extension' | 'trunk' | 'unknown' = () => 'unknown';
  private countListeners: (callId: string) => number = () => 0;
  /** Tiempo que una llamada terminada permanece visible antes de retirarse. */
  endedTtlMs = 8000;

  setTypeResolver(fn: (endpoint: string) => 'extension' | 'trunk' | 'unknown') {
    this.typeResolver = fn;
  }
  setListenerCounter(fn: (callId: string) => number) {
    this.countListeners = fn;
  }

  // ---------- Eventos ----------
  handle(evt: AmiEvent) {
    switch ((evt.event ?? '').toLowerCase()) {
      case 'newchannel':
        return this.onNewChannel(evt);
      case 'newstate':
        return this.onNewState(evt);
      case 'newcallerid':
        return this.onNewCallerId(evt);
      case 'newexten':
        return this.onNewExten(evt);
      case 'newconnectedline':
        return this.onConnectedLine(evt);
      case 'dialbegin':
        return this.onDialBegin(evt);
      case 'dialend':
        return this.onDialEnd(evt);
      case 'queuecallerjoin':
        return this.onQueueJoin(evt);
      case 'agentconnect':
        return this.onAgentConnect(evt);
      case 'bridgeenter':
        return this.onBridge(evt, true);
      case 'bridgeleave':
        return this.onBridge(evt, false);
      case 'hold':
        return this.onHold(evt, true);
      case 'unhold':
        return this.onHold(evt, false);
      case 'hangup':
        return this.onHangup(evt);
      default:
        return;
    }
  }

  private chanFrom(evt: AmiEvent, prefix = ''): Chan | null {
    const name = evt[`${prefix}channel`];
    const uniqueid = evt[`${prefix}uniqueid`];
    const linkedid = evt[`${prefix}linkedid`] ?? uniqueid;
    if (!name || !uniqueid || !linkedid) return null;
    let c = this.channels.get(uniqueid);
    if (!c) {
      c = {
        name, uniqueid, linkedid, state: evt[`${prefix}channelstatedesc`] ?? 'Unknown',
        callerNum: null, callerName: null, connectedNum: null, connectedName: null,
        exten: null, context: null, app: null, appData: null, createdAt: Date.now(), onHold: false, bridged: false,
      };
      this.channels.set(uniqueid, c);
    }
    const num = evt[`${prefix}calleridnum`];
    const nm = evt[`${prefix}calleridname`];
    if (num && num !== '<unknown>') c.callerNum = num;
    if (nm && nm !== '<unknown>') c.callerName = nm;
    const cnum = evt[`${prefix}connectedlinenum`];
    const cname = evt[`${prefix}connectedlinename`];
    if (cnum && cnum !== '<unknown>') c.connectedNum = cnum;
    if (cname && cname !== '<unknown>') c.connectedName = cname;
    if (evt[`${prefix}channelstatedesc`]) c.state = evt[`${prefix}channelstatedesc`]!;
    if (evt[`${prefix}exten`] && evt[`${prefix}exten`] !== 's') c.exten ??= evt[`${prefix}exten`]!;
    if (evt[`${prefix}context`]) c.context ??= evt[`${prefix}context`]!;
    return c;
  }

  private callFor(c: Chan): CallRec {
    let call = this.calls.get(c.linkedid);
    if (!call) {
      call = {
        id: c.linkedid, callerId: c.uniqueid, calleeId: null, dialed: c.exten, context: c.context, application: null,
        queue: null, startedAt: c.createdAt, ringingAt: null, answeredAt: null, endedAt: null, removeTimer: null,
      };
      this.calls.set(c.linkedid, call);
    } else if (call.calleeId === null && c.uniqueid !== call.callerId && !c.name.startsWith('Local/')) {
      call.calleeId = c.uniqueid;
    }
    return call;
  }

  private onNewChannel(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (!c) return;
    const call = this.callFor(c);
    if (call.callerId === c.uniqueid) {
      call.dialed ??= c.exten;
      call.context ??= c.context;
    }
    this.emitCall(call);
  }

  private onNewState(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (!c) return;
    const call = this.callFor(c);
    if (c.uniqueid !== call.callerId) {
      if (c.state === 'Ringing' || c.state === 'Ring') call.ringingAt ??= Date.now();
      if (c.state === 'Up') call.answeredAt ??= Date.now();
    }
    this.emitCall(call);
  }

  private onNewCallerId(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (c) this.emitCall(this.callFor(c));
  }

  private onConnectedLine(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (c) this.emitCall(this.callFor(c));
  }

  private onNewExten(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (!c) return;
    const app = evt.application ?? null;
    if (app && app !== 'NoOp' && app !== 'Set' && app !== 'Gosub' && app !== 'Answer' && app !== 'Goto') {
      c.app = app;
      c.appData = evt.appdata ?? null;
    }
    const call = this.callFor(c);
    if (c.uniqueid === call.callerId) {
      if (c.app) call.application = c.app;
      if (c.app === 'Queue' && c.appData) call.queue = c.appData.split(',')[0] ?? null;
      if (evt.exten && evt.exten !== 's' && evt.exten !== 'h') call.dialed ??= evt.exten;
    }
  }

  private onDialBegin(evt: AmiEvent) {
    const src = this.chanFrom(evt);
    const dst = this.chanFrom(evt, 'dest');
    if (!src) return;
    const call = this.callFor(src);
    if (dst && !dst.name.startsWith('Local/')) call.calleeId = dst.uniqueid;
    call.ringingAt ??= Date.now();
    if (!call.dialed && evt.dialstring) call.dialed = evt.dialstring.split('/').pop()?.split('@')[0] ?? evt.dialstring;
    this.emitCall(call);
  }

  private onDialEnd(evt: AmiEvent) {
    const src = this.chanFrom(evt);
    if (!src) return;
    const call = this.callFor(src);
    if ((evt.dialstatus ?? '').toUpperCase() === 'ANSWER') {
      call.answeredAt ??= Date.now();
      const dst = this.chanFrom(evt, 'dest');
      if (dst && !dst.name.startsWith('Local/')) call.calleeId = dst.uniqueid;
    }
    this.emitCall(call);
  }

  private onQueueJoin(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (!c) return;
    const call = this.callFor(c);
    call.queue = evt.queue ?? call.queue;
    call.application = 'Queue';
    this.emitCall(call);
  }

  private onAgentConnect(evt: AmiEvent) {
    const c = this.chanFrom(evt);
    if (!c) return;
    const call = this.callFor(c);
    call.answeredAt ??= Date.now();
    const dst = this.chanFrom(evt, 'dest');
    if (dst) call.calleeId = dst.uniqueid;
    this.emitCall(call);
  }

  private onBridge(evt: AmiEvent, enter: boolean) {
    const c = this.chanFrom(evt);
    if (!c) return;
    c.bridged = enter;
    const call = this.callFor(c);
    if (enter) {
      const bridgedPeers = [...this.channels.values()].filter((x) => x.linkedid === c.linkedid && x.bridged && !x.name.startsWith('Local/'));
      if (bridgedPeers.length >= 2) call.answeredAt ??= Date.now();
    }
    this.emitCall(call);
  }

  private onHold(evt: AmiEvent, hold: boolean) {
    const c = this.chanFrom(evt);
    if (!c) return;
    c.onHold = hold;
    this.emitCall(this.callFor(c));
  }

  private onHangup(evt: AmiEvent) {
    const uniqueid = evt.uniqueid;
    if (!uniqueid) return;
    const c = this.channels.get(uniqueid);
    this.channels.delete(uniqueid);
    const linkedid = c?.linkedid ?? evt.linkedid ?? uniqueid;
    const call = this.calls.get(linkedid);
    if (!call) return;
    const remaining = [...this.channels.values()].filter((x) => x.linkedid === linkedid);
    if (remaining.length === 0 || (remaining.every((x) => x.name.startsWith('Local/')) && c && !c.name.startsWith('Local/'))) {
      call.endedAt ??= Date.now();
      this.emitCall(call);
      if (!call.removeTimer) {
        call.removeTimer = setTimeout(() => {
          this.calls.delete(linkedid);
          for (const x of [...this.channels.values()]) if (x.linkedid === linkedid) this.channels.delete(x.uniqueid);
          this.emit('call-removed', { id: linkedid });
        }, this.endedTtlMs);
      }
    } else {
      this.emitCall(call);
    }
  }

  /** Reconstrucción inicial desde CoreShowChannels. */
  seed(events: AmiEvent[]) {
    const now = Date.now();
    for (const e of events) {
      if ((e.event ?? '').toLowerCase() !== 'coreshowchannel') continue;
      const c = this.chanFrom(e);
      if (!c) continue;
      c.createdAt = now - parseDuration(e.duration);
      c.app = e.application ?? null;
      c.appData = e.applicationdata ?? null;
      c.bridged = !!e.bridgeid;
      const call = this.callFor(c);
      if (c.createdAt < call.startedAt) {
        call.startedAt = c.createdAt;
        call.callerId = c.uniqueid;
      }
      if (c.state === 'Up' && c.uniqueid !== call.callerId) call.answeredAt ??= c.createdAt;
      if (c.app === 'Queue' && c.appData) call.queue = c.appData.split(',')[0] ?? null;
      if (c.app) call.application ??= c.app;
    }
    for (const call of this.calls.values()) this.emitCall(call);
  }

  clear() {
    for (const c of this.calls.values()) if (c.removeTimer) clearTimeout(c.removeTimer);
    this.calls.clear();
    this.channels.clear();
  }

  // ---------- Vista ----------
  private party(c: Chan | undefined, fallbackNumber: string | null): LiveCallParty {
    if (!c) return { channel: null, number: fallbackNumber, name: null, endpoint: null, type: 'other' };
    const ep = /^PJSIP\/(.+)-[0-9a-f]{8}$/i.exec(c.name)?.[1] ?? null; // los nombres de endpoint pueden llevar guiones
    let type: PartyType = 'other';
    if (c.name.startsWith('Local/')) type = 'local';
    else if (ep) {
      const t = this.typeResolver(ep);
      type = t === 'unknown' ? 'other' : t;
    }
    return { channel: c.name, number: c.callerNum ?? fallbackNumber, name: c.callerName, endpoint: ep, type };
  }

  toLiveCall(call: CallRec): LiveCall {
    const now = Date.now();
    const caller = this.channels.get(call.callerId);
    const callee = call.calleeId ? this.channels.get(call.calleeId) : undefined;
    const chans = [...this.channels.values()].filter((x) => x.linkedid === call.id);
    const callerParty = this.party(caller, null);
    const calleeParty = this.party(callee, call.dialed);
    if (!callee && caller?.connectedNum) calleeParty.number = caller.connectedNum;
    if (callee && !callee.callerNum && caller?.connectedNum) calleeParty.number = caller.connectedNum;

    let state: LiveCall['state'] = 'dialing';
    if (call.endedAt) state = 'ended';
    else if (chans.some((x) => x.onHold)) state = 'onhold';
    else if (call.answeredAt) state = 'talking';
    else if (call.queue) state = 'queued';
    else if (call.ringingAt) state = 'ringing';

    const direction: LiveCall['direction'] =
      callerParty.type === 'trunk' ? 'inbound'
      : callerParty.type === 'extension' && calleeParty.type === 'trunk' ? 'outbound'
      : callerParty.type === 'extension' && (calleeParty.type === 'extension' || !callee) ? 'internal'
      : 'unknown';

    const end = call.endedAt ?? now;
    const answered = call.answeredAt;
    return {
      id: call.id,
      state,
      direction,
      caller: callerParty,
      callee: calleeParty,
      dialed: call.dialed,
      context: call.context,
      application: call.application,
      queue: call.queue,
      startedAt: new Date(call.startedAt).toISOString(),
      ringingAt: iso(call.ringingAt),
      answeredAt: iso(answered),
      endedAt: iso(call.endedAt),
      times: {
        ring: call.ringingAt ? sec(call.ringingAt, answered ?? end) : 0,
        wait: sec(call.startedAt, answered ?? end),
        talk: answered ? sec(answered, end) : 0,
        total: sec(call.startedAt, end),
      },
      channels: chans.map((x) => x.name),
      listeners: this.countListeners(call.id),
      updatedAt: new Date(now).toISOString(),
    };
  }

  private emitCall(call: CallRec) {
    this.emit('call', this.toLiveCall(call));
  }

  list(): LiveCall[] {
    return [...this.calls.values()].map((c) => this.toLiveCall(c)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  get(id: string): LiveCall | undefined {
    const c = this.calls.get(id);
    return c ? this.toLiveCall(c) : undefined;
  }

  channelsOf(id: string): string[] {
    return [...this.channels.values()].filter((x) => x.linkedid === id).map((x) => x.name);
  }

  callerChannel(id: string): string | null {
    const c = this.calls.get(id);
    return c ? (this.channels.get(c.callerId)?.name ?? null) : null;
  }
}
