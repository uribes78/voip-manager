import type { Extension, ExtensionCreateInput, ExtensionSummary, EndpointStatus } from '@voip-manager/shared';
import type { EndpointMetaRow } from '../../db/schema/app/index.js';
import type { PjsipRows } from '../pjsip/store.js';
import { yn } from '../pjsip/store.js';
import { hintLine } from '../../services/hints.service.js';

/** Convierte la forma amigable en filas ps_endpoints / ps_aors / ps_auths. */
export function extensionToRows(x: ExtensionCreateInput): PjsipRows {
  const endpoint: PjsipRows['endpoint'] = {
    transport: x.transport,
    aors: x.id,
    auth: x.id,
    context: x.context,
    disallow: 'all',
    allow: x.codecs.join(','),
    dtmf_mode: x.dtmfMode,
    direct_media: yn(x.directMedia),
    rtp_symmetric: yn(x.nat),
    force_rport: yn(x.nat),
    rewrite_contact: yn(x.nat),
    callerid: `"${x.displayName.replace(/"/g, '')}" <${x.id}>`,
    mailboxes: x.mailbox,
    language: x.language,
    call_group: x.callGroup,
    pickup_group: x.pickupGroup,
    device_state_busy_at: '1',
    allow_subscribe: yn(x.blf),
    subscribe_context: x.subscribeContext,
    ...(x.webrtc ? { webrtc: 'yes', ice_support: 'yes', media_encryption: 'dtls', dtls_auto_generate_cert: 'yes' } : {}),
    ...x.advanced.endpoint,
  };
  const aor: PjsipRows['aor'] = {
    max_contacts: x.maxContacts,
    remove_existing: yn(x.removeExisting),
    qualify_frequency: x.qualifyFrequency,
    mailboxes: x.mailbox,
    ...x.advanced.aor,
  };
  const auth: PjsipRows['auth'] = {
    auth_type: 'userpass',
    username: x.authUsername ?? x.id,
    password: x.secret,
    ...x.advanced.auth,
  };
  return { endpoint, aor, auth };
}

export function metaToExtension(meta: EndpointMetaRow, status?: EndpointStatus): Extension {
  const cfg = (meta.deletedAt ? (meta.snapshot ?? meta.config) : meta.config) as unknown as ExtensionCreateInput;
  return {
    ...cfg,
    id: meta.endpointId,
    type: 'extension',
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
    deletedAt: meta.deletedAt ? meta.deletedAt.toISOString() : null,
    createdBy: meta.createdBy ?? null,
    online: status?.online ?? false,
    deviceState: status?.deviceState ?? 'Unknown',
    contacts: status?.contacts ?? [],
    hint: hintLine({ ...cfg, id: meta.endpointId, context: meta.context }),
  };
}

export function metaToSummary(meta: EndpointMetaRow, status?: EndpointStatus): ExtensionSummary {
  const cfg = meta.config as { maxContacts?: number };
  return {
    id: meta.endpointId,
    displayName: meta.displayName,
    context: meta.context,
    description: meta.description ?? undefined,
    type: 'extension',
    deletedAt: meta.deletedAt ? meta.deletedAt.toISOString() : null,
    updatedAt: meta.updatedAt.toISOString(),
    online: status?.online ?? false,
    deviceState: status?.deviceState ?? 'Unknown',
    maxContacts: cfg.maxContacts ?? 1,
  };
}
