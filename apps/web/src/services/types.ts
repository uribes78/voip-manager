export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface OkResponse {
  ok: true;
}
export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: boolean;
  ami: boolean;
  uptime: number;
}
