import { describe, expect, it } from 'vitest';
import type { AmiEvent } from 'asterisk-manager';
import { CallTracker } from '../services/call-tracker.js';
import { applyHints, hintLine } from '../services/hints.service.js';

const ev = (event: string, fields: Record<string, string>): AmiEvent => ({ event, ...fields }) as AmiEvent;

describe('CallTracker', () => {
  it('sigue una llamada interna: marcando → timbrando → hablando → terminada', () => {
    const t = new CallTracker();
    t.endedTtlMs = 50;
    t.setTypeResolver((e) => (['1001', '1002'].includes(e) ? 'extension' : 'unknown'));
    t.handle(ev('Newchannel', { channel: 'PJSIP/1001-00000001', uniqueid: '1.1', linkedid: '1.1', channelstatedesc: 'Ring', calleridnum: '1001', calleridname: 'Ana', exten: '1002', context: 'from-internal' }));
    expect(t.list()[0]).toMatchObject({ state: 'dialing', dialed: '1002', direction: 'internal', caller: { endpoint: '1001', number: '1001' } });
    t.handle(ev('Newexten', { channel: 'PJSIP/1001-00000001', uniqueid: '1.1', linkedid: '1.1', application: 'Dial', appdata: 'PJSIP/1002,30', exten: '1002', context: 'from-internal' }));
    t.handle(ev('Newchannel', { channel: 'PJSIP/1002-00000002', uniqueid: '1.2', linkedid: '1.1', channelstatedesc: 'Down', calleridnum: '1002', exten: '', context: 'from-internal' }));
    t.handle(ev('DialBegin', { channel: 'PJSIP/1001-00000001', uniqueid: '1.1', linkedid: '1.1', destchannel: 'PJSIP/1002-00000002', destuniqueid: '1.2', destlinkedid: '1.1', dialstring: 'PJSIP/1002' }));
    t.handle(ev('Newstate', { channel: 'PJSIP/1002-00000002', uniqueid: '1.2', linkedid: '1.1', channelstatedesc: 'Ringing' }));
    let c = t.get('1.1')!;
    expect(c.state).toBe('ringing');
    expect(c.callee).toMatchObject({ endpoint: '1002', channel: 'PJSIP/1002-00000002' });
    expect(c.application).toBe('Dial');
    t.handle(ev('DialEnd', { channel: 'PJSIP/1001-00000001', uniqueid: '1.1', linkedid: '1.1', destchannel: 'PJSIP/1002-00000002', destuniqueid: '1.2', destlinkedid: '1.1', dialstatus: 'ANSWER' }));
    c = t.get('1.1')!;
    expect(c.state).toBe('talking');
    expect(c.answeredAt).not.toBeNull();
    t.handle(ev('Hold', { channel: 'PJSIP/1002-00000002', uniqueid: '1.2', linkedid: '1.1' }));
    expect(t.get('1.1')!.state).toBe('onhold');
    t.handle(ev('Unhold', { channel: 'PJSIP/1002-00000002', uniqueid: '1.2', linkedid: '1.1' }));
    t.handle(ev('Hangup', { channel: 'PJSIP/1002-00000002', uniqueid: '1.2', linkedid: '1.1' }));
    expect(t.get('1.1')!.state).toBe('talking'); // aún queda el canal del llamante
    t.handle(ev('Hangup', { channel: 'PJSIP/1001-00000001', uniqueid: '1.1', linkedid: '1.1' }));
    expect(t.get('1.1')!.state).toBe('ended');
    expect(t.channelsOf('1.1')).toHaveLength(0);
  });

  it('detecta llamadas en cola y la dirección entrante por troncal', () => {
    const t = new CallTracker();
    t.setTypeResolver((e) => (e === 'carrier-mx' ? 'trunk' : e === '1001' ? 'extension' : 'unknown'));
    t.handle(ev('Newchannel', { channel: 'PJSIP/carrier-mx-00000003', uniqueid: '2.1', linkedid: '2.1', channelstatedesc: 'Ring', calleridnum: '5551234567', exten: '600', context: 'from-trunk' }));
    t.handle(ev('QueueCallerJoin', { channel: 'PJSIP/carrier-mx-00000003', uniqueid: '2.1', linkedid: '2.1', queue: 'soporte', position: '1' }));
    expect(t.get('2.1')).toMatchObject({ state: 'queued', queue: 'soporte', direction: 'inbound', dialed: '600' });
    t.handle(ev('AgentConnect', { channel: 'PJSIP/carrier-mx-00000003', uniqueid: '2.1', linkedid: '2.1', destchannel: 'PJSIP/1001-00000004', destuniqueid: '2.2', destlinkedid: '2.1', queue: 'soporte', holdtime: '12' }));
    expect(t.get('2.1')).toMatchObject({ state: 'talking', callee: { endpoint: '1001' } });
  });

  it('reconstruye desde CoreShowChannels', () => {
    const t = new CallTracker();
    t.seed([
      ev('CoreShowChannel', { channel: 'PJSIP/1001-0000000a', uniqueid: '3.1', linkedid: '3.1', channelstatedesc: 'Up', calleridnum: '1001', exten: '1002', context: 'from-internal', application: 'Dial', applicationdata: 'PJSIP/1002', duration: '00:01:30', bridgeid: 'b1' }),
      ev('CoreShowChannel', { channel: 'PJSIP/1002-0000000b', uniqueid: '3.2', linkedid: '3.1', channelstatedesc: 'Up', calleridnum: '1002', exten: '', context: 'from-internal', application: 'AppDial', applicationdata: '(Outgoing Line)', duration: '00:01:25', bridgeid: 'b1' }),
    ]);
    const c = t.get('3.1')!;
    expect(c.state).toBe('talking');
    expect(c.times.total).toBeGreaterThanOrEqual(89);
    expect(c.channels).toHaveLength(2);
  });
});

describe('hints BLF en extensions.conf', () => {
  it('genera la línea de hint según blf/presence', () => {
    expect(hintLine({ id: '1001', context: 'x' })).toBe('exten => 1001,hint,PJSIP/1001,CustomPresence:1001');
    expect(hintLine({ id: '1001', context: 'x', presence: false })).toBe('exten => 1001,hint,PJSIP/1001');
    expect(hintLine({ id: '1001', context: 'x', blf: false })).toBeNull();
  });

  it('inserta, reemplaza y elimina bloques gestionados sin tocar el resto', () => {
    const base = `[general]\nstatic=yes\n\n[from-internal]\nswitch => Realtime/from-internal@extensions\n\n[from-trunk]\nswitch => Realtime/from-trunk@extensions\n`;
    const hints = new Map([['from-internal', ['exten => 1001,hint,PJSIP/1001', 'exten => 1002,hint,PJSIP/1002']], ['ventas', ['exten => 2001,hint,PJSIP/2001']]]);
    const once = applyHints(base, hints);
    expect(once).toContain('[from-internal]\nswitch => Realtime/from-internal@extensions\n; >>> voip-manager');
    expect(once).toContain('exten => 1002,hint,PJSIP/1002\n; <<< voip-manager');
    expect(once).toContain('[ventas]\nswitch => Realtime/ventas@extensions\n; >>> voip-manager');
    expect(once).toContain('[from-trunk]\nswitch => Realtime/from-trunk@extensions');
    // segunda pasada con menos hints: no duplica y quita lo que sobra
    const twice = applyHints(once, new Map([['from-internal', ['exten => 1001,hint,PJSIP/1001']]]));
    expect(twice.match(/exten => 1001,hint/g)).toHaveLength(1);
    expect(twice).not.toContain('exten => 1002,hint');
    expect(twice).not.toContain('exten => 2001,hint');
    expect(twice).toContain('[ventas]'); // la sección queda, solo sin bloque gestionado
    // hints sueltos sin marcadores (p. ej. guardados por AMI) también se reemplazan
    const loose = `[from-internal]\nexten => 1001,hint,PJSIP/1001\nswitch => Realtime/from-internal@extensions\n`;
    const fixed = applyHints(loose, new Map([['from-internal', ['exten => 1001,hint,PJSIP/1001,CustomPresence:1001']]]));
    expect(fixed.match(/exten => 1001,hint/g)).toHaveLength(1);
    expect(fixed).toContain('CustomPresence:1001');
  });
});
