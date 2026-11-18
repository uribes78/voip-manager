import type { CreateUserInput, PaginationQuery, UpdateUserInput, UserPublic } from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { OkResponse, Paginated } from './types';

export const usersService = {
  list: (query: Partial<PaginationQuery>) => api.get<Paginated<UserPublic>>('/users', query),
  get: (id: number) => api.get<UserPublic>(`/users/${id}`),
  create: (input: CreateUserInput) => api.post<UserPublic>('/users', input),
  update: (id: number, input: UpdateUserInput) => api.patch<UserPublic>(`/users/${id}`, input),
  deactivate: (id: number) => api.delete<OkResponse>(`/users/${id}`),
};
