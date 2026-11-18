import type { HangupInput, ListenSession, ListenStartInput, MonitorCapabilities, MonitorSnapshot } from '@voip-manager/shared';
import { api } from '@/lib/api';

export const monitorService = {
  calls: () => api.get<MonitorSnapshot>('/monitor/calls'),
  capabilities: () => api.get<MonitorCapabilities>('/monitor/capabilities'),
  hangup: (id: string, input: Partial<HangupInput> = {}) =>
    api.post<{ ok: true; channels: string[] }>(`/monitor/calls/${encodeURIComponent(id)}/hangup`, input),
  listen: (id: string, input: Partial<ListenStartInput> = {}) =>
    api.post<ListenSession>(`/monitor/calls/${encodeURIComponent(id)}/listen`, input),
  stopListen: (sessionId: string) => api.delete<{ ok: true }>(`/monitor/listen/${encodeURIComponent(sessionId)}`),
  listenUrl: (session: ListenSession, token: string) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${session.wsPath}?token=${encodeURIComponent(token)}`;
  },
};
