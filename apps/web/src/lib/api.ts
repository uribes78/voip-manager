import { useAuthStore } from '@/stores/auth';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | Date | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Si es false no se envía Authorization ni se intenta refresh. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText || `Error ${res.status}`;
  let details: unknown;
  try {
    const data = (await res.json()) as { message?: string; details?: unknown };
    if (data?.message) message = data.message;
    details = data?.details;
  } catch {
    /* sin cuerpo JSON */
  }
  return new ApiError(res.status, message, details);
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const auth = useAuthStore();
  if (!refreshing) {
    refreshing = auth.refresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const auth = useAuthStore();
  const useAuth = opts.auth !== false;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (useAuth && auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

  const res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 401 && useAuth && !retried) {
    const ok = await tryRefresh();
    if (ok) return request<T>(method, path, opts, true);
    auth.logoutLocal();
    throw new ApiError(401, 'Sesión expirada. Inicia sesión de nuevo.');
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Envío multipart (FormData): el navegador fija el Content-Type con el boundary. */
export async function upload<T>(path: string, form: FormData, retried = false): Promise<T> {
  const auth = useAuthStore();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: form });
  if (res.status === 401 && !retried) {
    const ok = await tryRefresh();
    if (ok) return upload<T>(path, form, true);
    auth.logoutLocal();
    throw new ApiError(401, 'Sesión expirada. Inicia sesión de nuevo.');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export const api = {
  upload,
  get: <T>(path: string, query?: Query, opts?: Omit<RequestOptions, 'query'>) =>
    request<T>('GET', path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422 && Array.isArray(err.details)) {
      const issues = err.details as { path?: unknown[]; message?: string }[];
      return issues
        .slice(0, 3)
        .map((i) => `${(i.path ?? []).join('.')}: ${i.message ?? ''}`.replace(/^: /, ''))
        .join(' · ');
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Error desconocido';
}
