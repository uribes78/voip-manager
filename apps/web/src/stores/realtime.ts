import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AmiStatus, DashboardSnapshot, EndpointStatus, LiveCall, PresenceInfo, RegistrationStatus, WsEvent } from '@voip-manager/shared';

export type WsState = 'disconnected' | 'connecting' | 'connected';

export const useRealtimeStore = defineStore('realtime', () => {
  const wsState = ref<WsState>('disconnected');
  const ami = ref<AmiStatus | null>(null);
  const endpoints = ref<Record<string, EndpointStatus>>({});
  const registrations = ref<Record<string, RegistrationStatus>>({});
  const kpi = ref<DashboardSnapshot['kpi'] | null>(null);
  const lastEventAt = ref<string | null>(null);
  const calls = ref<Record<string, LiveCall>>({});
  const presence = ref<Record<string, PresenceInfo>>({});

  const endpointList = computed(() =>
    Object.values(endpoints.value).sort((a, b) => a.endpoint.localeCompare(b.endpoint, undefined, { numeric: true })),
  );
  const registrationList = computed(() => Object.values(registrations.value));
  const callList = computed(() => Object.values(calls.value).sort((a, b) => a.startedAt.localeCompare(b.startedAt)));
  const activeCalls = computed(() => callList.value.filter((c) => c.state !== 'ended').length);
  const onlineExtensions = computed(
    () => endpointList.value.filter((e) => e.type === 'extension' && e.online).length,
  );

  function applySnapshot(snapshot: DashboardSnapshot) {
    ami.value = snapshot.ami;
    kpi.value = snapshot.kpi;
    endpoints.value = Object.fromEntries(snapshot.endpoints.map((e) => [e.endpoint, e]));
    registrations.value = Object.fromEntries(snapshot.registrations.map((r) => [r.registration, r]));
    lastEventAt.value = new Date().toISOString();
  }

  function applyEvent(event: WsEvent) {
    lastEventAt.value = new Date().toISOString();
    switch (event.type) {
      case 'snapshot':
        applySnapshot(event.data);
        break;
      case 'endpoint':
        endpoints.value = { ...endpoints.value, [event.data.endpoint]: event.data };
        if (kpi.value) {
          const list = Object.values(endpoints.value);
          kpi.value = {
            ...kpi.value,
            onlineExtensions: list.filter((e) => e.type === 'extension' && e.online).length,
            onlineTrunks: list.filter((e) => e.type === 'trunk' && e.online).length,
            activeCalls: list.reduce((acc, e) => acc + e.activeChannels, 0),
          };
        }
        break;
      case 'registration':
        registrations.value = { ...registrations.value, [event.data.registration]: event.data };
        break;
      case 'ami':
        ami.value = event.data;
        break;
      case 'call':
        calls.value = { ...calls.value, [event.data.id]: event.data };
        break;
      case 'call-removed': {
        const { [event.data.id]: _removed, ...rest } = calls.value;
        calls.value = rest;
        break;
      }
      case 'presence':
        presence.value = { ...presence.value, [event.data.endpoint]: event.data };
        break;
      case 'raw':
        break;
    }
  }

  function setCalls(list: LiveCall[]) {
    calls.value = Object.fromEntries(list.map((c) => [c.id, c]));
  }

  function endpointStatus(id: string): EndpointStatus | undefined {
    return endpoints.value[id];
  }

  return {
    wsState,
    ami,
    endpoints,
    registrations,
    kpi,
    lastEventAt,
    endpointList,
    registrationList,
    calls,
    callList,
    activeCalls,
    presence,
    setCalls,
    onlineExtensions,
    applySnapshot,
    applyEvent,
    endpointStatus,
  };
});
