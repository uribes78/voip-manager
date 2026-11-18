import { z } from 'zod';
import { PaginationQuery, advancedRecord, partialWithoutDefaults } from './common.js';
import {
  CODECS, DTMF_MODES, PS_AOR_COLUMNS, PS_AUTH_COLUMNS, PS_ENDPOINT_COLUMNS,
} from './asterisk-columns.js';

export const EndpointId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo');

/** Pares columna=valor que se escriben tal cual en las tablas ps_* (apartado avanzado). */
export const EndpointAdvanced = z.object({
  endpoint: advancedRecord(PS_ENDPOINT_COLUMNS),
  aor: advancedRecord(PS_AOR_COLUMNS),
  auth: advancedRecord(PS_AUTH_COLUMNS),
});
export type EndpointAdvanced = z.infer<typeof EndpointAdvanced>;

export const ExtensionBase = z.object({
  id: EndpointId.describe('Número de extensión; se usa como id de endpoint, aor y auth'),
  displayName: z.string().trim().min(1).max(60),
  secret: z.string().min(8).max(64),
  authUsername: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(255).optional(),
  context: z.string().trim().min(1).max(40).default('from-internal'),
  transport: z.string().trim().min(1).max(40).default('transport-udp'),
  codecs: z.array(z.enum(CODECS)).min(1).default(['ulaw', 'alaw', 'g722']),
  dtmfMode: z.enum(DTMF_MODES).default('rfc4733'),
  maxContacts: z.number().int().min(1).max(10).default(1),
  removeExisting: z.boolean().default(true),
  qualifyFrequency: z.number().int().min(0).max(300).default(60),
  directMedia: z.boolean().default(false),
  nat: z.boolean().default(true).describe('Activa rtp_symmetric, force_rport y rewrite_contact'),
  webrtc: z.boolean().default(false),
  mailbox: z.string().trim().max(80).optional(),
  language: z.string().trim().max(10).optional(),
  callGroup: z.string().trim().max(40).optional(),
  pickupGroup: z.string().trim().max(40).optional(),
  /** Publica un hint (exten => <id>,hint,PJSIP/<id>) para BLF en los teléfonos. */
  blf: z.boolean().default(true),
  /** El hint incluye CustomPresence:<id> para poder fijar presencia (disponible, ausente, no molestar...). */
  presence: z.boolean().default(true),
  /** Contexto donde los teléfonos buscan los hints; por defecto el contexto de la extensión. */
  subscribeContext: z.string().trim().max(40).optional(),
  advanced: EndpointAdvanced.default({ endpoint: {}, aor: {}, auth: {} }),
});

export const ExtensionCreateInput = ExtensionBase;
export type ExtensionCreateInput = z.infer<typeof ExtensionCreateInput>;
/** Valores de entrada antes de aplicar defaults (lo que envía el formulario). */
export type ExtensionCreateForm = z.input<typeof ExtensionCreateInput>;

export const ExtensionUpdateInput = partialWithoutDefaults(ExtensionBase.omit({ id: true }));
export type ExtensionUpdateInput = z.infer<typeof ExtensionUpdateInput>;

export const ExtensionCloneInput = z.object({
  newId: EndpointId,
  displayName: z.string().trim().min(1).max(60),
  secret: z.string().min(8).max(64).optional().describe('Si se omite, se genera una aleatoria'),
});
export type ExtensionCloneInput = z.infer<typeof ExtensionCloneInput>;

export const ExtensionListQuery = PaginationQuery.extend({
  context: z.string().trim().max(40).optional(),
  includeDeleted: z.coerce.boolean().default(false),
});
export type ExtensionListQuery = z.infer<typeof ExtensionListQuery>;

export const ContactStatus = z.object({
  uri: z.string(),
  status: z.string().describe('Avail | Unavail | NonQualified | Unknown | Created | Removed'),
  rtt: z.number().nullable(),
  userAgent: z.string().nullable(),
  viaAddress: z.string().nullable(),
});
export type ContactStatus = z.infer<typeof ContactStatus>;

export const Extension = ExtensionBase.extend({
  type: z.literal('extension'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  createdBy: z.string().nullable(),
  online: z.boolean().optional(),
  deviceState: z.string().optional(),
  contacts: z.array(ContactStatus).optional(),
  hint: z.string().nullable().optional().describe('Línea de hint generada en extensions.conf'),
  presenceState: z.string().optional().describe('Estado de presencia actual (CustomPresence)'),
});
export type Extension = z.infer<typeof Extension>;

export const ExtensionSummary = Extension.pick({
  id: true, displayName: true, context: true, description: true, type: true,
  deletedAt: true, updatedAt: true, online: true, deviceState: true, maxContacts: true,
});
export type ExtensionSummary = z.infer<typeof ExtensionSummary>;
