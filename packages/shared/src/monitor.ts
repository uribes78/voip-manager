import { z } from 'zod';

export const LiveCallState = z.enum(['dialing', 'ringing', 'queued', 'talking', 'onhold', 'ended']);
export type LiveCallState = z.infer<typeof LiveCallState>;

export const LiveCallParty = z.object({
  channel: z.string().nullable(),
  number: z.string().nullable(),
  name: z.string().nullable(),
  endpoint: z.string().nullable().describe('Nombre del endpoint PJSIP si el canal es PJSIP/<endpoint>-...'),
  type: z.enum(['extension', 'trunk', 'local', 'other']),
});
export type LiveCallParty = z.infer<typeof LiveCallParty>;

export const LiveCall = z.object({
  id: z.string().describe('Linkedid de Asterisk'),
  state: LiveCallState,
  direction: z.enum(['internal', 'inbound', 'outbound', 'unknown']),
  caller: LiveCallParty,
  callee: LiveCallParty,
  dialed: z.string().nullable().describe('Número/extensión marcada'),
  context: z.string().nullable(),
  application: z.string().nullable().describe('Última aplicación: Dial, Queue, Playback...'),
  queue: z.string().nullable(),
  startedAt: z.string().datetime(),
  ringingAt: z.string().datetime().nullable(),
  answeredAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable(),
  /** Segundos, calculados por el servidor al enviar. */
  times: z.object({ ring: z.number(), wait: z.number(), talk: z.number(), total: z.number() }),
  channels: z.array(z.string()),
  listeners: z.number().int().describe('Sesiones de escucha activas'),
  updatedAt: z.string().datetime(),
});
export type LiveCall = z.infer<typeof LiveCall>;

export const MonitorSnapshot = z.object({
  calls: z.array(LiveCall),
  active: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type MonitorSnapshot = z.infer<typeof MonitorSnapshot>;

export const CallIdParam = z.object({ id: z.string().min(1).max(150) });

export const HangupInput = z.object({
  channel: z.string().max(120).optional().describe('Canal específico; si se omite se cuelgan todos los canales de la llamada'),
  cause: z.number().int().min(0).max(127).default(16),
});
export type HangupInput = z.infer<typeof HangupInput>;

export const ListenStartInput = z.object({
  channel: z.string().max(120).optional().describe('Canal a escuchar; por defecto el del llamante'),
  direction: z.enum(['in', 'out', 'both']).default('both'),
});
export type ListenStartInput = z.infer<typeof ListenStartInput>;

export const ListenSession = z.object({
  sessionId: z.string(),
  callId: z.string(),
  channel: z.string(),
  wsPath: z.string().describe('Ruta WebSocket para recibir el audio en el navegador'),
  codec: z.literal('slin'),
  sampleRate: z.literal(8000),
  startedAt: z.string().datetime(),
  forkActive: z.boolean().describe('Asterisk ya está enviando audio'),
});
export type ListenSession = z.infer<typeof ListenSession>;

export const MonitorCapabilities = z.object({
  audiofork: z.boolean().describe('app_audiofork.so cargado en Asterisk'),
  publicWsUrl: z.string().nullable().describe('URL que Asterisk usa para enviar audio al servicio'),
});
export type MonitorCapabilities = z.infer<typeof MonitorCapabilities>;

// ---- Presencia (func_presencestate / CustomPresence) ----
export const PresenceStateValue = z.enum(['not_set', 'unavailable', 'available', 'away', 'xa', 'chat', 'dnd']);
export type PresenceStateValue = z.infer<typeof PresenceStateValue>;

export const PresenceInfo = z.object({
  endpoint: z.string(),
  state: PresenceStateValue,
  subtype: z.string().nullable(),
  message: z.string().nullable(),
});
export type PresenceInfo = z.infer<typeof PresenceInfo>;

export const SetPresenceInput = z.object({
  state: PresenceStateValue,
  subtype: z.string().trim().max(40).optional(),
  message: z.string().trim().max(120).optional(),
});
export type SetPresenceInput = z.infer<typeof SetPresenceInput>;

export const HintsSyncResult = z.object({
  file: z.string(),
  backend: z.enum(['fs', 'ami', 'none']),
  contexts: z.array(z.object({ context: z.string(), hints: z.number().int() })),
  reloaded: z.boolean(),
  warnings: z.array(z.string()),
});
export type HintsSyncResult = z.infer<typeof HintsSyncResult>;
