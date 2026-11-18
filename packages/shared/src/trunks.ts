import { z } from 'zod';
import { PaginationQuery, advancedRecord } from './common.js';
import {
  CODECS, PS_AOR_COLUMNS, PS_AUTH_COLUMNS, PS_ENDPOINT_COLUMNS, PS_IDENTIFY_COLUMNS, PS_REGISTRATION_COLUMNS,
} from './asterisk-columns.js';
import { EndpointId } from './extensions.js';

export const TrunkAdvanced = z.object({
  endpoint: advancedRecord(PS_ENDPOINT_COLUMNS),
  aor: advancedRecord(PS_AOR_COLUMNS),
  auth: advancedRecord(PS_AUTH_COLUMNS),
  registration: advancedRecord(PS_REGISTRATION_COLUMNS),
  identify: advancedRecord(PS_IDENTIFY_COLUMNS),
});
export type TrunkAdvanced = z.infer<typeof TrunkAdvanced>;

export const TrunkMode = z.enum(['ip', 'credentials']);
export type TrunkMode = z.infer<typeof TrunkMode>;

export const HostOrIp = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9.:\-\[\]]+$/, 'Host o IP inválido');
export const IpOrCidr = z
  .string()
  .trim()
  .regex(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/, 'IP o CIDR inválido');

export const TrunkBase = z.object({
  id: EndpointId.describe('Nombre de la troncal'),
  description: z.string().trim().max(255).optional(),
  mode: TrunkMode,
  host: HostOrIp.describe('IP o dominio del carrier/PBX remoto'),
  port: z.number().int().min(1).max(65535).default(5060),
  transport: z.string().trim().min(1).max(40).default('transport-udp'),
  context: z.string().trim().min(1).max(40).default('from-trunk'),
  codecs: z.array(z.enum(CODECS)).min(1).default(['ulaw', 'alaw']),
  /** Modo ip: direcciones adicionales que identifican al remoto (ps_endpoint_id_ips). */
  matchAddresses: z.array(IpOrCidr).default([]),
  /** Modo credentials */
  username: z.string().trim().max(80).optional(),
  secret: z.string().max(128).optional(),
  authUsername: z.string().trim().max(80).optional(),
  register: z.boolean().default(false),
  fromUser: z.string().trim().max(80).optional(),
  fromDomain: z.string().trim().max(255).optional(),
  callerId: z.string().trim().max(80).optional(),
  qualifyFrequency: z.number().int().min(0).max(300).default(60),
  directMedia: z.boolean().default(false),
  advanced: TrunkAdvanced.default({ endpoint: {}, aor: {}, auth: {}, registration: {}, identify: {} }),
});

export const TrunkCreateInput = TrunkBase.superRefine((t, ctx) => {
  if (t.mode === 'credentials') {
    if (!t.username) ctx.addIssue({ code: 'custom', path: ['username'], message: 'Requerido en modo credenciales' });
    if (!t.secret) ctx.addIssue({ code: 'custom', path: ['secret'], message: 'Requerido en modo credenciales' });
  }
});
export type TrunkCreateInput = z.infer<typeof TrunkCreateInput>;
export type TrunkCreateForm = z.input<typeof TrunkBase>;

export const TrunkUpdateInput = TrunkBase.omit({ id: true }).partial();
export type TrunkUpdateInput = z.infer<typeof TrunkUpdateInput>;

export const TrunkListQuery = PaginationQuery.extend({
  includeDeleted: z.coerce.boolean().default(false),
});
export type TrunkListQuery = z.infer<typeof TrunkListQuery>;

export const Trunk = TrunkBase.extend({
  type: z.literal('trunk'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
  createdBy: z.string().nullable(),
  online: z.boolean().optional(),
  registrationStatus: z.string().optional().describe('Registered | Unregistered | Rejected | n/a'),
});
export type Trunk = z.infer<typeof Trunk>;
