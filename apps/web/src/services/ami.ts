import type {
  AmiStatus,
  DashboardSnapshot,
  EndpointStatus,
  OriginateInput,
  OriginateResult,
  ReloadInput,
  ReloadResult,
} from '@voip-manager/shared';
import { api } from '@/lib/api';

export const amiService = {
  status: () => api.get<AmiStatus>('/ami/status'),
  dashboard: () => api.get<DashboardSnapshot>('/ami/dashboard'),
  endpoints: () => api.get<EndpointStatus[]>('/ami/endpoints'),
  reload: (input: ReloadInput) => api.post<ReloadResult>('/ami/reload', input),
  originate: (input: OriginateInput) => api.post<OriginateResult>('/ami/originate', input),
};
