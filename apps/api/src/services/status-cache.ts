import { EventEmitter } from 'node:events';
import type { ContactStatus, EndpointStatus, RegistrationStatus } from '@voip-manager/shared';

type EndpointType = EndpointStatus['type'];

/**
 * Estado en memoria de endpoints, contactos, registros y canales activos, alimentado por eventos AMI.
 * Emite `endpoint`, `registration` y `channels` para el WebSocket.
 */
export class StatusCache extends EventEmitter {
  private endpoints = new Map<string, EndpointStatus>();
  private registrations = new Map<string, RegistrationStatus>();
  private channels = new Map<string, { endpoint: string | null; since: number }>();
  private typeResolver: (endpoint: string) => EndpointType = () => 'unknown';

  setTypeResolver(fn: (endpoint: string) => EndpointType) {
    this.typeResolver = fn;
    for (const ep of this.endpoints.values()) ep.type = fn(ep.endpoint);
  }

  private ensure(endpoint: string): EndpointStatus {
    let ep = this.endpoints.get(endpoint);
    if (!ep) {
      ep = {
        endpoint,
        type: this.typeResolver(endpoint),
        deviceState: 'Unknown',
        online: false,
        contacts: [],
        activeChannels: 0,
        updatedAt: new Date().toISOString(),
      };
      this.endpoints.set(endpoint, ep);
    }
    return ep;
  }

  private touch(ep: EndpointStatus) {
    ep.online = ep.contacts.some((c) => c.status === 'Avail' || c.status === 'NonQualified' || c.status === 'Created')
      || (ep.deviceState !== 'Unavailable' && ep.deviceState !== 'Unknown' && ep.deviceState !== 'Invalid');
    ep.updatedAt = new Date().toISOString();
    this.emit('endpoint', ep);
  }

  setDeviceState(endpoint: string, state: string) {
    const ep = this.ensure(endpoint);
    ep.deviceState = state;
    this.touch(ep);
  }

  /** Reemplaza todos los contactos de un endpoint (p.ej. tras PJSIPShowContacts). */
  setContacts(endpoint: string, contacts: ContactStatus[]) {
    const ep = this.ensure(endpoint);
    ep.contacts = contacts;
    this.touch(ep);
  }

  upsertContact(endpoint: string, contact: ContactStatus) {
    const ep = this.ensure(endpoint);
    const idx = ep.contacts.findIndex((c) => c.uri === contact.uri);
    if (contact.status === 'Removed') {
      if (idx >= 0) ep.contacts.splice(idx, 1);
    } else if (idx >= 0) {
      ep.contacts[idx] = contact;
    } else {
      ep.contacts.push(contact);
    }
    this.touch(ep);
  }

  removeEndpoint(endpoint: string) {
    this.endpoints.delete(endpoint);
  }

  setRegistration(reg: RegistrationStatus) {
    this.registrations.set(reg.registration, reg);
    this.emit('registration', reg);
  }

  channelUp(uniqueid: string, channel: string) {
    const m = /^PJSIP\/([^-]+)-/.exec(channel);
    const endpoint = m?.[1] ?? null;
    this.channels.set(uniqueid, { endpoint, since: Date.now() });
    if (endpoint) {
      const ep = this.ensure(endpoint);
      ep.activeChannels++;
      this.touch(ep);
    }
    this.emit('channels', this.channels.size);
  }

  channelDown(uniqueid: string) {
    const ch = this.channels.get(uniqueid);
    if (!ch) return;
    this.channels.delete(uniqueid);
    if (ch.endpoint) {
      const ep = this.ensure(ch.endpoint);
      ep.activeChannels = Math.max(0, ep.activeChannels - 1);
      this.touch(ep);
    }
    this.emit('channels', this.channels.size);
  }

  resetChannels() {
    this.channels.clear();
    for (const ep of this.endpoints.values()) ep.activeChannels = 0;
  }

  get(endpoint: string): EndpointStatus | undefined {
    return this.endpoints.get(endpoint);
  }
  list(): EndpointStatus[] {
    return [...this.endpoints.values()].sort((a, b) => a.endpoint.localeCompare(b.endpoint));
  }
  listRegistrations(): RegistrationStatus[] {
    return [...this.registrations.values()];
  }
  activeCalls(): number {
    return this.channels.size;
  }
  clear() {
    this.endpoints.clear();
    this.registrations.clear();
    this.channels.clear();
  }
}
