import type {
  ExtensionSummary,
  PaginationQuery,
  Queue,
  QueueCreateForm,
  QueueMember,
  QueueMemberAddInput,
  QueueMemberUpdateInput,
  QueueUpdateInput,
} from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { OkResponse, Paginated } from './types';

const q = (name: string) => `/queues/${encodeURIComponent(name)}`;

export const queuesService = {
  list: (query: Partial<PaginationQuery>) => api.get<Paginated<Queue>>('/queues', query),
  get: (name: string) => api.get<Queue>(q(name)),
  create: (input: QueueCreateForm) => api.post<Queue>('/queues', input),
  update: (name: string, input: QueueUpdateInput) => api.patch<Queue>(q(name), input),
  remove: (name: string) => api.delete<OkResponse>(q(name)),
  members: (name: string) => api.get<QueueMember[]>(`${q(name)}/members`),
  addMember: (name: string, input: QueueMemberAddInput) => api.post<QueueMember>(`${q(name)}/members`, input),
  updateMember: (name: string, uniqueid: number, input: QueueMemberUpdateInput) =>
    api.patch<QueueMember>(`${q(name)}/members/${uniqueid}`, input),
  removeMember: (name: string, uniqueid: number) => api.delete<OkResponse>(`${q(name)}/members/${uniqueid}`),
  availableExtensions: (name: string) =>
    api.get<ExtensionSummary[]>('/queues/available-extensions', { name }),
};
