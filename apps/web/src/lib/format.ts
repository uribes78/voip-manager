const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'medium',
});
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? String(value) : dateTimeFmt.format(d);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? String(value) : dateFmt.format(d);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function randomSecret(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Convierte los null de la API en undefined para los formularios. */
export function stripNulls<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === null ? undefined : v;
  return out as { [K in keyof T]: Exclude<T[K], null> };
}

export function deviceStateVariant(state: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch ((state ?? '').toLowerCase()) {
    case 'not in use':
      return 'default';
    case 'in use':
    case 'ringing':
    case 'ringinuse':
    case 'busy':
    case 'onhold':
      return 'secondary';
    case 'unavailable':
    case 'invalid':
      return 'destructive';
    default:
      return 'outline';
  }
}

export const DEVICE_STATE_LABELS: Record<string, string> = {
  'not in use': 'Disponible',
  'in use': 'En llamada',
  busy: 'Ocupado',
  ringing: 'Timbrando',
  ringinuse: 'Timbrando (en uso)',
  onhold: 'En espera',
  unavailable: 'No disponible',
  invalid: 'Inválido',
  unknown: 'Desconocido',
};

export function deviceStateLabel(state: string | undefined): string {
  if (!state) return 'Desconocido';
  return DEVICE_STATE_LABELS[state.toLowerCase()] ?? state;
}
