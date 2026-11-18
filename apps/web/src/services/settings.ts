import type { AsteriskConfigBundle, AuditEntry, PaginationQuery } from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { HealthResponse, Paginated } from './types';

export const settingsService = {
  asteriskConfig: () => api.get<AsteriskConfigBundle>('/settings/asterisk-config'),
  audit: (query: Partial<PaginationQuery>) => api.get<Paginated<AuditEntry>>('/settings/audit', query),
  health: () => api.get<HealthResponse>('/health', undefined, { auth: false }),
};
