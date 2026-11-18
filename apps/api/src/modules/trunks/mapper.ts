import type { Trunk, TrunkCreateInput, EndpointStatus, RegistrationStatus } from '@voip-manager/shared';
import type { EndpointMetaRow } from '../../db/schema/app/index.js';
import type { PjsipRows } from '../pjsip/store.js';
import { yn } from '../pjsip/store.js';

const hostPort = (t: TrunkCreateInput) => (t.port && t.port !== 5060 ? `${t.host}:${t.port}` : t.host);

export function trunkToRows(t: TrunkCreateInput): PjsipRows {
  const creds = t.mode === 'credentials';
  const endpoint: PjsipRows['endpoint'] = {
    transport: t.transport,
    aors: t.id,
    context: t.context,
    disallow: 'all',
    allow: t.codecs.join(','),
    direct_media: yn(t.directMedia),
    rtp_symmetric: 'yes',
    force_rport: 'yes',
    rewrite_contact: 'yes',
    send_pai: 'yes',
    trust_id_inbound: 'yes',
    callerid: t.callerId,
    from_user: t.fromUser ?? (creds ? t.username : undefined),
    from_domain: t.fromDomain,
    outbound_auth: creds ? t.id : undefined,
    ...t.advanced.endpoint,
  };
  const aor: PjsipRows['aor'] = {
    contact: `sip:${hostPort(t)}`,
    qualify_frequency: t.qualifyFrequency,
    max_contacts: 1,
    ...t.advanced.aor,
  };
  const identify: PjsipRows['identify'] = {
    endpoint: t.id,
    match: [t.host, ...t.matchAddresses].filter((v, i, a) => a.indexOf(v) === i).join(','),
    srv_lookups: 'yes',
    ...t.advanced.identify,
  };
  const rows: PjsipRows = { endpoint, aor, identify };
  if (creds) {
    rows.auth = {
      auth_type: 'userpass',
      username: t.authUsername ?? t.username,
      password: t.secret,
      ...t.advanced.auth,
    };
    if (t.register) {
      rows.registration = {
        endpoint: t.id,
        transport: t.transport,
        outbound_auth: t.id,
        server_uri: `sip:${hostPort(t)}`,
        client_uri: `sip:${t.username}@${hostPort(t)}`,
        contact_user: t.fromUser ?? t.username,
        retry_interval: 60,
        forbidden_retry_interval: 600,
        fatal_retry_interval: 0,
        max_retries: 10000,
        expiration: 3600,
        auth_rejection_permanent: 'no',
        line: 'yes',
        ...t.advanced.registration,
      };
    }
  }
  return rows;
}

export function metaToTrunk(meta: EndpointMetaRow, status?: EndpointStatus, reg?: RegistrationStatus): Trunk {
  const cfg = (meta.deletedAt ? (meta.snapshot ?? meta.config) : meta.config) as unknown as TrunkCreateInput;
  const registering = cfg.mode === 'credentials' && cfg.register;
  return {
    ...cfg,
    id: meta.endpointId,
    type: 'trunk',
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
    deletedAt: meta.deletedAt ? meta.deletedAt.toISOString() : null,
    createdBy: meta.createdBy ?? null,
    online: registering ? reg?.status === 'Registered' : (status?.online ?? false),
    registrationStatus: registering ? (reg?.status ?? 'Unknown') : 'n/a',
  };
}
