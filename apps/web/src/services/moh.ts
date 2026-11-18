import type { MohClass, MohClassCreateInput, MohClassUpdateInput, MohEnvironment, MohFile, MohUploadResult } from '@voip-manager/shared';
import { api } from '@/lib/api';

export const mohService = {
  list: () => api.get<{ classes: MohClass[]; environment: MohEnvironment }>('/moh'),
  get: (name: string) => api.get<MohClass>(`/moh/${encodeURIComponent(name)}`),
  create: (input: MohClassCreateInput) => api.post<MohClass>('/moh', input),
  update: (name: string, input: MohClassUpdateInput) => api.patch<MohClass>(`/moh/${encodeURIComponent(name)}`, input),
  remove: (name: string, deleteFiles: boolean) => api.delete<{ ok: true }>(`/moh/${encodeURIComponent(name)}`, { query: { deleteFiles } }),
  reload: () => api.post<{ ok: boolean; response: string }>('/moh/reload'),
  files: (name: string) => api.get<MohFile[]>(`/moh/${encodeURIComponent(name)}/files`),
  upload: (name: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    return api.upload<MohUploadResult>(`/moh/${encodeURIComponent(name)}/files`, form);
  },
  deleteFile: (name: string, file: string) => api.delete<{ ok: true }>(`/moh/${encodeURIComponent(name)}/files/${encodeURIComponent(file)}`),
  previewUrl: (name: string, file: string, token: string) =>
    `/api/v1/moh/${encodeURIComponent(name)}/files/${encodeURIComponent(file)}/preview?token=${encodeURIComponent(token)}`,
};
