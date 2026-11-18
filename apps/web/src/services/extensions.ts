import type {
  HintsSyncResult, PresenceInfo, SetPresenceInput,
  EndpointStatus,
  Extension,
  ExtensionCloneInput,
  ExtensionCreateForm,
  ExtensionListQuery,
  ExtensionSummary,
  ExtensionUpdateInput,
} from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { OkResponse, Paginated } from './types';

export const extensionsService = {
  list: (query: Partial<ExtensionListQuery>) => api.get<Paginated<ExtensionSummary>>('/extensions', query),
  get: (id: string) => api.get<Extension>(`/extensions/${encodeURIComponent(id)}`),
  create: (input: ExtensionCreateForm) => api.post<Extension>('/extensions', input),
  update: (id: string, input: ExtensionUpdateInput) =>
    api.patch<Extension>(`/extensions/${encodeURIComponent(id)}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/extensions/${encodeURIComponent(id)}`),
  clone: (id: string, input: ExtensionCloneInput) =>
    api.post<Extension>(`/extensions/${encodeURIComponent(id)}/clone`, input),
  restore: (id: string) => api.post<Extension>(`/extensions/${encodeURIComponent(id)}/restore`),
  status: (id: string) => api.get<EndpointStatus>(`/extensions/${encodeURIComponent(id)}/status`),
  presence: (id: string) => api.get<PresenceInfo>(`/extensions/${encodeURIComponent(id)}/presence`),
  setPresence: (id: string, input: SetPresenceInput) => api.put<PresenceInfo>(`/extensions/${encodeURIComponent(id)}/presence`, input),
  syncHints: () => api.post<HintsSyncResult>('/extensions/hints/sync'),
};
