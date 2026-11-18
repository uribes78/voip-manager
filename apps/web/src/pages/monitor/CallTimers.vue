<script setup lang="ts">
import { computed } from 'vue';
import type { LiveCall } from '@voip-manager/shared';
import { formatDuration } from '@/lib/format';

const props = defineProps<{ call: LiveCall; now: number; compact?: boolean }>();

// Los tiempos se recalculan en el cliente a partir de las marcas para que corran sin esperar eventos.
const t = computed(() => {
  const c = props.call;
  const end = c.endedAt ? Date.parse(c.endedAt) : props.now;
  const started = Date.parse(c.startedAt);
  const ringing = c.ringingAt ? Date.parse(c.ringingAt) : null;
  const answered = c.answeredAt ? Date.parse(c.answeredAt) : null;
  const s = (a: number, b: number) => Math.max(0, Math.round((b - a) / 1000));
  return {
    ring: ringing ? s(ringing, answered ?? end) : 0,
    wait: s(started, answered ?? end),
    talk: answered ? s(answered, end) : 0,
    total: s(started, end),
  };
});
</script>

<template>
  <div v-if="compact" class="flex items-center gap-3 font-mono text-xs tabular-nums">
    <span :title="'Timbrado'"><span class="text-muted-foreground">R</span> {{ formatDuration(t.ring) }}</span>
    <span :title="'Espera'"><span class="text-muted-foreground">E</span> {{ formatDuration(t.wait) }}</span>
    <span :title="'Conversación'" :class="call.answeredAt && 'text-primary font-semibold'"><span class="text-muted-foreground">C</span> {{ formatDuration(t.talk) }}</span>
  </div>
  <div v-else class="grid grid-cols-4 gap-2 text-center">
    <div><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Timbrado</p><p class="font-mono text-sm tabular-nums">{{ formatDuration(t.ring) }}</p></div>
    <div><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Espera</p><p class="font-mono text-sm tabular-nums">{{ formatDuration(t.wait) }}</p></div>
    <div><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Conversación</p><p class="font-mono text-sm tabular-nums" :class="call.answeredAt && 'font-semibold text-primary'">{{ formatDuration(t.talk) }}</p></div>
    <div><p class="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p class="font-mono text-sm tabular-nums">{{ formatDuration(t.total) }}</p></div>
  </div>
</template>
