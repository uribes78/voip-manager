import { describe, expect, it } from 'vitest';
import { ttlToSeconds } from '../modules/auth/service.js';
import { parseAsteriskLine } from '../services/logs.service.js';
import { StatusCache } from '../services/status-cache.js';

describe('ttlToSeconds', () => {
  it('convierte unidades', () => {
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('7d')).toBe(604800);
    expect(ttlToSeconds('30')).toBe(30);
    expect(() => ttlToSeconds('abc')).toThrow();
  });
});

describe('parseAsteriskLine', () => {
  it('extrae fecha, nivel y módulo', () => {
    const l = parseAsteriskLine('[2026-11-17 10:00:00] WARNING[1234] res_pjsip.c: Something failed');
    expect(l.timestamp).toBe('2026-11-17 10:00:00');
    expect(l.level).toBe('WARNING');
    expect(l.module).toBe('res_pjsip.c');
    expect(l.message).toBe('Something failed');
  });
  it('soporta el formato con línea y función', () => {
    const l = parseAsteriskLine('[2026-11-17 10:00:00] ERROR[55]: res_odbc.c:123 odbc_obj_connect: Connection failed');
    expect(l.level).toBe('ERROR');
    expect(l.module).toBe('res_odbc.c');
    expect(l.message).toBe('Connection failed');
  });
  it('no recorta mensajes con dos puntos', () => {
    const l = parseAsteriskLine("[2026-11-18 01:29:13] WARNING[55]: res_pjsip_outbound_registration.c:1234 handle_registration_response: Fatal response '403' received from 'sip.carrier.mx' on registration attempt to 'sip:u@x', stopping outbound registration");
    expect(l.module).toBe('res_pjsip_outbound_registration.c');
    expect(l.message.startsWith("Fatal response '403'")).toBe(true);
    const v = parseAsteriskLine('[2026-11-18 01:29:04] VERBOSE[1] Asterisk Ready.');
    expect(v.level).toBe('VERBOSE');
    expect(v.message).toBe('Asterisk Ready.');
  });
  it('devuelve la línea cruda si no coincide', () => {
    expect(parseAsteriskLine('texto libre').message).toBe('texto libre');
  });
});

describe('StatusCache', () => {
  it('marca online con contacto Avail y cuenta canales por endpoint', () => {
    const c = new StatusCache();
    c.setDeviceState('1001', 'Unavailable');
    expect(c.get('1001')?.online).toBe(false);
    c.upsertContact('1001', { uri: 'sip:1001@10.0.0.5', status: 'Avail', rtt: 12, userAgent: null, viaAddress: null });
    expect(c.get('1001')?.online).toBe(true);
    c.channelUp('u1', 'PJSIP/1001-00000001');
    expect(c.get('1001')?.activeChannels).toBe(1);
    expect(c.activeCalls()).toBe(1);
    c.channelDown('u1');
    expect(c.get('1001')?.activeChannels).toBe(0);
    c.upsertContact('1001', { uri: 'sip:1001@10.0.0.5', status: 'Removed', rtt: null, userAgent: null, viaAddress: null });
    expect(c.get('1001')?.contacts).toHaveLength(0);
  });
});
