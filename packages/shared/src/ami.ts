import { z } from 'zod';
import { ContactStatus } from './extensions.js';
import { LiveCall, PresenceInfo } from './monitor.js';

export const AmiStatus = z.object({
  connected: z.boolean(),
  host: z.string(),
  port: z.number().int(),
  connectedSince: z.string().datetime().nullable(),
  lastEventAt: z.string().datetime().nullable(),
  asteriskVersion: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type AmiStatus = z.infer<typeof AmiStatus>;

export const EndpointStatus = z.object({
  endpoint: z.string(),
  type: z.enum(['extension', 'trunk', 'unknown']),
  deviceState: z.string().describe('Not in use | In use | Busy | Unavailable | Ringing | ...'),
  online: z.boolean(),
  contacts: z.array(ContactStatus),
  activeChannels: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type EndpointStatus = z.infer<typeof EndpointStatus>;

export const RegistrationStatus = z.object({
  registration: z.string(),
  status: z.string(),
  serverUri: z.string().nullable(),
  clientUri: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

export const DashboardSnapshot = z.object({
  ami: AmiStatus,
  endpoints: z.array(EndpointStatus),
  registrations: z.array(RegistrationStatus),
  kpi: z.object({
    totalExtensions: z.number().int(),
    onlineExtensions: z.number().int(),
    totalTrunks: z.number().int(),
    onlineTrunks: z.number().int(),
    activeCalls: z.number().int(),
    queues: z.number().int(),
  }),
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>;

export const ReloadModule = z.enum(['pjsip', 'queues', 'dialplan', 'cdr', 'odbc', 'musiconhold', 'all']);
export type ReloadModule = z.infer<typeof ReloadModule>;

export const ReloadInput = z.object({ module: ReloadModule });
export type ReloadInput = z.infer<typeof ReloadInput>;

export const ReloadResult = z.object({
  module: ReloadModule,
  command: z.string(),
  response: z.string(),
  ok: z.boolean(),
});
export type ReloadResult = z.infer<typeof ReloadResult>;

export const OriginateInput = z.object({
  from: z.string().trim().min(1).max(40).describe('Extensión origen (PJSIP/<ext>)'),
  to: z.string().trim().min(1).max(40).describe('Número o extensión destino'),
  context: z.string().trim().min(1).max(40).default('from-internal'),
  timeout: z.number().int().min(5).max(120).default(30),
  callerId: z.string().trim().max(80).optional(),
  /** Si es true, la llamada se contesta y se reproduce un audio de prueba en lugar de marcar a `to`. */
  playback: z.string().trim().max(80).optional().describe('Nombre de audio, p.ej. hello-world'),
});
export type OriginateInput = z.infer<typeof OriginateInput>;

export const OriginateResult = z.object({
  actionId: z.string(),
  response: z.string(),
  message: z.string().nullable(),
  ok: z.boolean(),
});
export type OriginateResult = z.infer<typeof OriginateResult>;

/** Mensajes que viajan por el WebSocket /ws/events */
export const WsEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), data: DashboardSnapshot }),
  z.object({ type: z.literal('endpoint'), data: EndpointStatus }),
  z.object({ type: z.literal('registration'), data: RegistrationStatus }),
  z.object({ type: z.literal('ami'), data: AmiStatus }),
  z.object({ type: z.literal('raw'), data: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('call'), data: LiveCall }),
  z.object({ type: z.literal('call-removed'), data: z.object({ id: z.string() }) }),
  z.object({ type: z.literal('presence'), data: PresenceInfo }),
]);
export type WsEvent = z.infer<typeof WsEvent>;
