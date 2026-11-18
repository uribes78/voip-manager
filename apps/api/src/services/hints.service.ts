import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { HintsSyncResult, PresenceInfo, PresenceStateValue, SetPresenceInput } from '@voip-manager/shared';
import { vmEndpointMeta } from '../db/schema/app/index.js';
import { ConfigFilesService } from './config-files.service.js';
import { asteriskUnavailable } from './errors.js';

const BEGIN = '; >>> voip-manager: hints BLF generados automáticamente, no editar a mano';
const END = '; <<< voip-manager: fin de hints';
const FILE = 'extensions.conf';

interface ExtCfg {
  id: string;
  context: string;
  blf?: boolean;
  presence?: boolean;
  subscribeContext?: string;
}

/** Línea de hint de una extensión (o null si no publica BLF). */
export function hintLine(cfg: ExtCfg): string | null {
  if (cfg.blf === false) return null;
  const provider = cfg.presence === false ? '' : `,CustomPresence:${cfg.id}`;
  return `exten => ${cfg.id},hint,PJSIP/${cfg.id}${provider}`;
}

/**
 * Inserta/reemplaza el bloque de hints de cada contexto en extensions.conf. pbx_realtime no soporta hints,
 * por eso viven como líneas estáticas junto al `switch => Realtime/...` del contexto.
 */
export function applyHints(text: string, hintsByContext: Map<string, string[]>): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  // 1) quitar bloques gestionados existentes
  const cleaned: string[] = [];
  let skipping = false;
  for (const l of lines) {
    if (l.trim() === BEGIN) {
      skipping = true;
      continue;
    }
    if (l.trim() === END) {
      skipping = false;
      continue;
    }
    if (!skipping) cleaned.push(l);
  }
  // 2) quitar hints sueltos de las extensiones gestionadas (p. ej. tras guardar por AMI, sin comentarios)
  const managedIds = new Set([...hintsByContext.values()].flat().map((h) => /^exten\s*=>\s*([^,]+),hint,/.exec(h)?.[1]).filter(Boolean));
  const base = cleaned.filter((l) => {
    const m = /^\s*exten\s*=>?\s*([^,]+),hint,/i.exec(l);
    return !(m && managedIds.has(m[1]!.trim()));
  });
  // 3) localizar secciones
  const sections: Array<{ name: string; start: number; end: number }> = [];
  base.forEach((l, i) => {
    const m = /^\s*\[([^\]]+)\]/.exec(l);
    if (m) {
      if (sections.length) sections[sections.length - 1]!.end = i;
      sections.push({ name: m[1]!.trim(), start: i, end: base.length });
    }
  });
  const out = [...base];
  // Insertar de abajo hacia arriba para no desplazar índices.
  const contexts = [...hintsByContext.entries()].filter(([, h]) => h.length);
  const existing = contexts.filter(([c]) => sections.some((s) => s.name === c)).sort((a, b) => {
    const sa = sections.find((s) => s.name === a[0])!.end;
    const sb = sections.find((s) => s.name === b[0])!.end;
    return sb - sa;
  });
  for (const [ctx, hints] of existing) {
    const sec = sections.find((s) => s.name === ctx)!;
    let insertAt = sec.end;
    while (insertAt > sec.start + 1 && out[insertAt - 1]!.trim() === '') insertAt--;
    out.splice(insertAt, 0, BEGIN, ...hints, END, '');
  }
  for (const [ctx, hints] of contexts.filter(([c]) => !sections.some((s) => s.name === c))) {
    if (out.length && out[out.length - 1]!.trim() !== '') out.push('');
    out.push(`[${ctx}]`, `switch => Realtime/${ctx}@extensions`, BEGIN, ...hints, END, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export class HintsService {
  private readonly files: ConfigFilesService;
  constructor(private readonly app: FastifyInstance) {
    this.files = new ConfigFilesService(app.env, app.ami);
  }

  async collect(): Promise<Map<string, string[]>> {
    const rows = await this.app.db
      .select({ id: vmEndpointMeta.endpointId, context: vmEndpointMeta.context, config: vmEndpointMeta.config })
      .from(vmEndpointMeta)
      .where(and(eq(vmEndpointMeta.type, 'extension'), isNull(vmEndpointMeta.deletedAt)));
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const cfg = r.config as unknown as ExtCfg;
      const line = hintLine({ ...cfg, id: r.id, context: r.context });
      if (!line) continue;
      const ctx = cfg.subscribeContext || r.context || 'from-internal';
      map.set(ctx, [...(map.get(ctx) ?? []), line]);
    }
    for (const list of map.values()) list.sort();
    return map;
  }

  async sync(reload = true): Promise<HintsSyncResult> {
    const hints = await this.collect();
    const current = await this.files.read(FILE);
    if (current.backend === 'none') throw asteriskUnavailable('Sin acceso a extensions.conf: define ASTERISK_ETC_PATH o conecta AMI');
    const next = applyHints(current.content, hints);
    const warnings: string[] = [];
    let reloaded = false;
    if (next !== current.content) {
      const res = await this.files.write(FILE, next, current.hash, reload);
      warnings.push(...res.warnings);
      reloaded = !!res.reload?.ok;
    } else if (reload && this.app.ami.isConnected()) {
      reloaded = true; // nada que cambiar
    }
    return {
      file: FILE,
      backend: current.backend,
      contexts: [...hints.entries()].map(([context, h]) => ({ context, hints: h.length })),
      reloaded,
      warnings,
    };
  }
}

// ---------- Presencia (func_presencestate, proveedor CustomPresence) ----------
const VALID: PresenceStateValue[] = ['not_set', 'unavailable', 'available', 'away', 'xa', 'chat', 'dnd'];

export class PresenceService {
  constructor(private readonly app: FastifyInstance) {}

  private async getvar(variable: string): Promise<string> {
    const res = await this.app.ami.action({ action: 'Getvar', variable });
    return (res.value ?? '').trim();
  }

  async get(endpoint: string): Promise<PresenceInfo> {
    if (!this.app.ami.isConnected()) throw asteriskUnavailable();
    const provider = `CustomPresence:${endpoint}`;
    const [value, subtype, message] = await Promise.all([
      this.getvar(`PRESENCE_STATE(${provider},value)`),
      this.getvar(`PRESENCE_STATE(${provider},subtype)`),
      this.getvar(`PRESENCE_STATE(${provider},message)`),
    ]);
    const state = (VALID.includes(value as PresenceStateValue) ? value : 'not_set') as PresenceStateValue;
    return { endpoint, state, subtype: subtype || null, message: message || null };
  }

  async set(endpoint: string, input: SetPresenceInput): Promise<PresenceInfo> {
    if (!this.app.ami.isConnected()) throw asteriskUnavailable();
    const value = [input.state, input.subtype ?? '', input.message ?? ''].map((s) => s.replace(/,/g, ' ')).join(',');
    await this.app.ami.action({ action: 'Setvar', variable: `PRESENCE_STATE(CustomPresence:${endpoint})`, value });
    return this.get(endpoint);
  }
}
