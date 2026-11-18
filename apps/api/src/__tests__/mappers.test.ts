import { describe, expect, it } from 'vitest';
import { ExtensionCreateInput, TrunkCreateInput } from '@voip-manager/shared';
import { extensionToRows } from '../modules/extensions/mapper.js';
import { trunkToRows } from '../modules/trunks/mapper.js';

describe('extensionToRows', () => {
  it('genera endpoint/aor/auth con el mismo id y defaults razonables', () => {
    const input = ExtensionCreateInput.parse({ id: '1001', displayName: 'Ana "Soporte"', secret: 'secreto123' });
    const rows = extensionToRows(input);
    expect(rows.endpoint.aors).toBe('1001');
    expect(rows.endpoint.auth).toBe('1001');
    expect(rows.endpoint.context).toBe('from-internal');
    expect(rows.endpoint.allow).toBe('ulaw,alaw,g722');
    expect(rows.endpoint.disallow).toBe('all');
    expect(rows.endpoint.callerid).toBe('"Ana Soporte" <1001>');
    expect(rows.endpoint.rtp_symmetric).toBe('yes');
    expect(rows.aor.max_contacts).toBe(1);
    expect(rows.aor.remove_existing).toBe('yes');
    expect(rows.auth).toMatchObject({ auth_type: 'userpass', username: '1001', password: 'secreto123' });
  });

  it('el apartado avanzado sobreescribe columnas y rechaza columnas desconocidas', () => {
    const input = ExtensionCreateInput.parse({
      id: '1002', displayName: 'X', secret: 'secreto123', nat: false,
      advanced: { endpoint: { rtp_symmetric: 'yes', tos_audio: 'ef' }, aor: {}, auth: {} },
    });
    const rows = extensionToRows(input);
    expect(rows.endpoint.rtp_symmetric).toBe('yes');
    expect(rows.endpoint.force_rport).toBe('no');
    expect(rows.endpoint.tos_audio).toBe('ef');
    const bad = ExtensionCreateInput.safeParse({
      id: '1003', displayName: 'X', secret: 'secreto123', advanced: { endpoint: { no_existe: '1' }, aor: {}, auth: {} },
    });
    expect(bad.success).toBe(false);
  });

  it('webrtc activa dtls e ice', () => {
    const rows = extensionToRows(ExtensionCreateInput.parse({ id: '2001', displayName: 'Web', secret: 'secreto123', webrtc: true }));
    expect(rows.endpoint.webrtc).toBe('yes');
    expect(rows.endpoint.media_encryption).toBe('dtls');
  });
});

describe('trunkToRows', () => {
  it('troncal por IP: identify con host y matchAddresses, sin auth ni registration', () => {
    const t = TrunkCreateInput.parse({ id: 'pbx-remota', mode: 'ip', host: '10.1.2.3', matchAddresses: ['10.1.2.0/24'] });
    const rows = trunkToRows(t);
    expect(rows.auth).toBeUndefined();
    expect(rows.registration).toBeUndefined();
    expect(rows.identify?.match).toBe('10.1.2.3,10.1.2.0/24');
    expect(rows.aor.contact).toBe('sip:10.1.2.3');
    expect(rows.endpoint.context).toBe('from-trunk');
  });

  it('troncal con credenciales y registro: auth + registration apuntando al carrier', () => {
    const t = TrunkCreateInput.parse({
      id: 'carrier', mode: 'credentials', host: 'sip.carrier.mx', port: 5080, username: 'u123', secret: 'p', register: true, callerId: '5551234567',
    });
    const rows = trunkToRows(t);
    expect(rows.endpoint.outbound_auth).toBe('carrier');
    expect(rows.endpoint.auth).toBeUndefined();
    expect(rows.endpoint.callerid).toBe('5551234567');
    expect(rows.auth).toMatchObject({ username: 'u123', password: 'p' });
    expect(rows.registration).toMatchObject({ server_uri: 'sip:sip.carrier.mx:5080', client_uri: 'sip:u123@sip.carrier.mx:5080', outbound_auth: 'carrier' });
  });

  it('modo credenciales exige usuario y secreto', () => {
    expect(TrunkCreateInput.safeParse({ id: 'x', mode: 'credentials', host: 'h' }).success).toBe(false);
  });
});

describe('normalizeExtensionConfig', () => {
  it('aplica defaults a configs guardadas con esquemas anteriores', async () => {
    const { normalizeExtensionConfig } = await import('../modules/extensions/mapper.js');
    const legacy = { id: '1001', displayName: 'Ana', secret: 'Secreto.1001', context: 'from-internal', codecs: ['ulaw'] };
    const cfg = normalizeExtensionConfig(legacy, '1001');
    expect(cfg.blf).toBe(true);
    expect(cfg.presence).toBe(true);
    expect(cfg.codecs).toEqual(['ulaw']);
    expect(cfg.secret).toBe('Secreto.1001');
  });
  it('no rompe con una config inválida', async () => {
    const { normalizeExtensionConfig } = await import('../modules/extensions/mapper.js');
    const cfg = normalizeExtensionConfig({ displayName: 'X', secret: 'corta', codecs: ['nope'] }, '1002');
    expect(cfg.id).toBe('1002');
    expect(cfg.blf).toBe(true);
  });
});
