import type { PresenceStateValue } from '@voip-manager/shared';

export const PRESENCE_OPTIONS: Array<{ value: PresenceStateValue; label: string; dot: string }> = [
  { value: 'available', label: 'Disponible', dot: 'bg-emerald-500' },
  { value: 'away', label: 'Ausente', dot: 'bg-amber-500' },
  { value: 'xa', label: 'Ausente prolongado', dot: 'bg-orange-500' },
  { value: 'chat', label: 'Chat', dot: 'bg-sky-500' },
  { value: 'dnd', label: 'No molestar', dot: 'bg-red-500' },
  { value: 'unavailable', label: 'No disponible', dot: 'bg-zinc-400' },
  { value: 'not_set', label: 'Sin definir', dot: 'bg-muted-foreground/40' },
];
export const presenceLabel = (v: string) => PRESENCE_OPTIONS.find((o) => o.value === v)?.label ?? v;
export const presenceDot = (v: string) => PRESENCE_OPTIONS.find((o) => o.value === v)?.dot ?? 'bg-muted-foreground/40';
