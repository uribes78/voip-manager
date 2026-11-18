import type {
  ConfigFileContent, ConfigFileInfo, ConfigFileWriteInput, ConfigFileWriteResult, FeaturesSummary, AsteriskConfigBundle, AuditEntry, PaginationQuery } from '@voip-manager/shared';
import { api } from '@/lib/api';
import type { HealthResponse, Paginated } from './types';

export const settingsService = {
  asteriskConfig: () => api.get<AsteriskConfigBundle>('/settings/asterisk-config'),
  audit: (query: Partial<PaginationQuery>) => api.get<Paginated<AuditEntry>>('/settings/audit', query),
  files: () => api.get<ConfigFileInfo[]>('/settings/files'),
  readFile: (file: string) => api.get<ConfigFileContent>(`/settings/files/${encodeURIComponent(file)}`),
  writeFile: (file: string, input: ConfigFileWriteInput) => api.put<ConfigFileWriteResult>(`/settings/files/${encodeURIComponent(file)}`, input),
  features: () => api.get<FeaturesSummary>('/settings/features'),
  health: () => api.get<HealthResponse>('/health', undefined, { auth: false }),
};
