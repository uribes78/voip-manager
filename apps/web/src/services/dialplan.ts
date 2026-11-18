import type {
  DialplanBulkInput,
  DialplanContext,
  DialplanLine,
  DialplanLineInput,
  DialplanLineUpdateInput,
} from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { OkResponse } from './types';

export const dialplanService = {
  contexts: () => api.get<DialplanContext[]>('/dialplan/contexts'),
  lines: (context: string) => api.get<DialplanLine[]>(`/dialplan/contexts/${encodeURIComponent(context)}`),
  removeContext: (context: string) => api.delete<OkResponse>(`/dialplan/contexts/${encodeURIComponent(context)}`),
  createLine: (input: DialplanLineInput) => api.post<DialplanLine>('/dialplan/lines', input),
  updateLine: (id: number, input: DialplanLineUpdateInput) => api.patch<DialplanLine>(`/dialplan/lines/${id}`, input),
  removeLine: (id: number) => api.delete<OkResponse>(`/dialplan/lines/${id}`),
  bulk: (input: DialplanBulkInput) => api.post<DialplanLine[]>('/dialplan/bulk', input),
};
