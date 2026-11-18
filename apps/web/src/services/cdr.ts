import type { CdrQuery, CdrRecord, CdrStats } from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { Paginated } from './types';

export type CdrFilters = Partial<Omit<CdrQuery, 'from' | 'to'>> & { from?: string; to?: string };

export const cdrService = {
  list: (query: CdrFilters) => api.get<Paginated<CdrRecord>>('/cdr', query),
  stats: (query: CdrFilters) => {
    const { page: _p, pageSize: _s, ...rest } = query;
    return api.get<CdrStats>('/cdr/stats', rest);
  },
};
