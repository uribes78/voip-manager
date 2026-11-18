import type { Trunk, TrunkCreateForm, TrunkListQuery, TrunkUpdateInput } from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { OkResponse, Paginated } from './types';

export const trunksService = {
  list: (query: Partial<TrunkListQuery>) => api.get<Paginated<Trunk>>('/trunks', query),
  get: (id: string) => api.get<Trunk>(`/trunks/${encodeURIComponent(id)}`),
  create: (input: TrunkCreateForm) => api.post<Trunk>('/trunks', input),
  update: (id: string, input: TrunkUpdateInput) => api.patch<Trunk>(`/trunks/${encodeURIComponent(id)}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/trunks/${encodeURIComponent(id)}`),
  restore: (id: string) => api.post<Trunk>(`/trunks/${encodeURIComponent(id)}/restore`),
};
