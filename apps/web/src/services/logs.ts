import type { LogQuery, LogResult } from '@voip-manager/shared';
import { api } from '@/lib/api';

export const logsService = {
  read: (query: Partial<LogQuery>) => api.get<LogResult>('/logs', query),
};
