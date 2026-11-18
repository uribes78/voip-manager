<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import {
  ArrowDownLeftIcon, ArrowUpRightIcon, ArrowLeftRightIcon, HeadphonesIcon, LayoutGridIcon, ListIcon, PhoneOffIcon, RadioIcon, SquareIcon, Volume2Icon, VolumeXIcon,
} from '@lucide/vue';
import type { LiveCall } from '@voip-manager/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import KpiCard from '@/components/common/KpiCard.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import CallTimers from './CallTimers.vue';
import { monitorService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';
import { useLiveAudio } from '@/composables/useLiveAudio';

const auth = useAuthStore();
const realtime = useRealtimeStore();
const canExecute = computed(() => auth.hasPermission('monitor:execute'));
const view = useLocalStorage<'cards' | 'table'>('voip-manager.monitor-view', 'cards');

// Respaldo HTTP si el WebSocket no está conectado.
const snapshot = useQuery({
  queryKey: ['monitor', 'calls'],
  queryFn: monitorService.calls,
  refetchInterval: computed(() => (realtime.wsState === 'connected' ? false : 3000)),
});
watch(() => snapshot.data.value, (d) => { if (d && realtime.wsState !== 'connected') realtime.setCalls(d.calls); }, { immediate: true });
const caps = useQuery({ queryKey: ['monitor', 'capabilities'], queryFn: monitorService.capabilities, staleTime: 60_000 });

// Reloj para que los contadores corran.
const now = ref(Date.now());
let timer: number | undefined;
onMounted(() => { timer = window.setInterval(() => (now.value = Date.now()), 1000); });
onBeforeUnmount(() => window.clearInterval(timer));

const calls = computed(() => realtime.callList);
const active = computed(() => calls.value.filter((c) => c.state !== 'ended'));
const stats = computed(() => ({
  talking: active.value.filter((c) => c.state === 'talking' || c.state === 'onhold').length,
  ringing: active.value.filter((c) => c.state === 'ringing' || c.state === 'dialing').length,
  queued: active.value.filter((c) => c.state === 'queued').length,
}));

const stateMeta: Record<LiveCall['state'], { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; dot: string }> = {
  dialing: { label: 'Marcando', variant: 'secondary', dot: 'bg-sky-500' },
  ringing: { label: 'Timbrando', variant: 'secondary', dot: 'bg-amber-500 animate-pulse' },
  queued: { label: 'En cola', variant: 'outline', dot: 'bg-amber-500 animate-pulse' },
  talking: { label: 'En conversación', variant: 'default', dot: 'bg-emerald-500' },
  onhold: { label: 'En espera', variant: 'outline', dot: 'bg-violet-500' },
  ended: { label: 'Finalizada', variant: 'destructive', dot: 'bg-zinc-400' },
};
const dirIcon = (d: LiveCall['direction']) => (d === 'inbound' ? ArrowDownLeftIcon : d === 'outbound' ? ArrowUpRightIcon : ArrowLeftRightIcon);
const dirLabel: Record<LiveCall['direction'], string> = { inbound: 'Entrante', outbound: 'Saliente', internal: 'Interna', unknown: 'Desconocida' };
const partyLabel = (p: LiveCall['caller']) => {
  if (p.endpoint) return p.endpoint;
  if (p.channel?.startsWith('Local/')) return p.channel.replace(/^Local\//, '').replace(/-[0-9a-f]+;[12]$/i, '');
  return p.number ?? p.channel?.replace(/^[^/]+\//, '').replace(/-[0-9a-f]{8}$/i, '') ?? '—';
};

// ---- colgar ----
const hangupTarget = ref<LiveCall | null>(null);
const hangup = useMutation({
  mutationFn: (id: string) => monitorService.hangup(id),
  onSuccess: (r) => {
    toast.success('Llamada colgada', { description: r.channels.join(', ') });
    hangupTarget.value = null;
  },
  onError: (e) => toast.error('No se pudo colgar', { description: errorMessage(e) }),
});

// ---- escucha ----
const audio = useLiveAudio();
const listeningId = computed(() => audio.session.value?.callId ?? null);
async function toggleListen(call: LiveCall) {
  if (listeningId.value === call.id) return audio.stop();
  try {
    await audio.start(call.id);
  } catch (e) {
    toast.error('No se pudo iniciar la escucha', { description: errorMessage(e) });
  }
}
// Si la llamada escuchada desaparece, parar.
watch(calls, (list) => {
  if (listeningId.value && !list.some((c) => c.id === listeningId.value && c.state !== 'ended')) void audio.stop();
});
const listeningCall = computed(() => calls.value.find((c) => c.id === listeningId.value) ?? null);
</script>

<template>
  <PageHeader title="Monitor de llamadas" description="Llamadas en curso reconstruidas desde los eventos de Asterisk, con tiempos de timbrado, espera y conversación.">
    <Badge variant="outline" class="gap-1.5">
      <span class="size-1.5 rounded-full" :class="realtime.wsState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'" />
      {{ realtime.wsState === 'connected' ? 'Eventos en vivo' : 'Consulta cada 3 s' }}
    </Badge>
    <Tabs v-model="view">
      <TabsList>
        <TabsTrigger value="cards" aria-label="Tarjetas"><LayoutGridIcon /></TabsTrigger>
        <TabsTrigger value="table" aria-label="Tabla"><ListIcon /></TabsTrigger>
      </TabsList>
    </Tabs>
  </PageHeader>

  <div class="grid gap-3 sm:grid-cols-3">
    <KpiCard label="En conversación" :value="stats.talking" tone="success"><template #icon><RadioIcon class="size-4" /></template></KpiCard>
    <KpiCard label="Timbrando" :value="stats.ringing" :tone="stats.ringing ? 'warning' : 'default'" />
    <KpiCard label="En cola" :value="stats.queued" :tone="stats.queued ? 'warning' : 'default'" />
  </div>

  <Alert v-if="canExecute && caps.data.value && !caps.data.value.audiofork" class="mt-4">
    <AlertTitle>Escucha en vivo no disponible</AlertTitle>
    <AlertDescription>Asterisk no tiene cargado <code>app_audiofork.so</code>. Colgar llamadas sí funciona.</AlertDescription>
  </Alert>

  <!-- Reproductor -->
  <Card v-if="audio.session.value" class="mt-4 border-primary/40">
    <CardContent class="flex flex-wrap items-center gap-3">
      <span class="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><HeadphonesIcon class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">
          Escuchando {{ listeningCall ? `${partyLabel(listeningCall.caller)} → ${partyLabel(listeningCall.callee)}` : audio.session.value.channel }}
          <Badge variant="outline" class="ml-2 font-mono text-[10px]">{{ audio.state.value === 'playing' ? 'en vivo' : audio.state.value === 'connecting' ? 'conectando…' : audio.state.value }}</Badge>
        </p>
        <p class="truncate font-mono text-xs text-muted-foreground">{{ audio.session.value.channel }} · SLIN 8 kHz</p>
      </div>
      <div class="h-2 w-28 overflow-hidden rounded-full bg-muted"><div class="h-full bg-primary transition-[width] duration-75" :style="{ width: `${Math.min(100, Math.round(audio.level.value * 140))}%` }" /></div>
      <Button variant="outline" size="icon-sm" :aria-label="audio.muted.value ? 'Activar sonido' : 'Silenciar'" @click="audio.toggleMute()">
        <VolumeXIcon v-if="audio.muted.value" /><Volume2Icon v-else />
      </Button>
      <Button variant="destructive" size="sm" @click="audio.stop()"><SquareIcon /> Detener</Button>
    </CardContent>
  </Card>

  <EmptyState v-if="calls.length === 0" class="mt-6" title="Sin llamadas en curso" description="Las llamadas aparecerán aquí en cuanto Asterisk las inicie.">
    <template #icon><RadioIcon class="size-5" /></template>
  </EmptyState>

  <!-- Tarjetas -->
  <div v-else-if="view === 'cards'" class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    <Card v-for="c in calls" :key="c.id" :class="c.state === 'ended' && 'opacity-60'" size="sm">
      <CardContent class="space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="size-2 shrink-0 rounded-full" :class="stateMeta[c.state].dot" />
            <Badge :variant="stateMeta[c.state].variant">{{ stateMeta[c.state].label }}</Badge>
            <Badge v-if="c.queue" variant="outline" class="font-mono">cola {{ c.queue }}</Badge>
            <Badge v-if="c.listeners" variant="outline" class="gap-1"><HeadphonesIcon class="size-3" /> {{ c.listeners }}</Badge>
          </div>
          <Tooltip>
            <TooltipTrigger as-child><component :is="dirIcon(c.direction)" class="size-4 text-muted-foreground" /></TooltipTrigger>
            <TooltipContent>{{ dirLabel[c.direction] }}</TooltipContent>
          </Tooltip>
        </div>
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div class="min-w-0">
            <p class="truncate text-lg font-semibold tracking-tight">{{ partyLabel(c.caller) }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ c.caller.name || c.caller.number || '—' }}</p>
          </div>
          <ArrowLeftRightIcon class="size-4 text-muted-foreground" />
          <div class="min-w-0 text-right">
            <p class="truncate text-lg font-semibold tracking-tight">{{ partyLabel(c.callee) }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ c.callee.name || (c.dialed && c.dialed !== partyLabel(c.callee) ? `marcó ${c.dialed}` : '') || '—' }}</p>
          </div>
        </div>
        <CallTimers :call="c" :now="now" />
        <div class="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span>{{ formatDateTime(c.startedAt) }}<span v-if="c.application"> · {{ c.application }}</span></span>
          <div v-if="canExecute && c.state !== 'ended'" class="flex gap-1">
            <Button :variant="listeningId === c.id ? 'default' : 'ghost'" size="icon-sm" :disabled="caps.data.value && !caps.data.value.audiofork" :aria-label="listeningId === c.id ? 'Dejar de escuchar' : 'Escuchar'" @click="toggleListen(c)">
              <HeadphonesIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Colgar" @click="hangupTarget = c"><PhoneOffIcon /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- Tabla -->
  <Card v-else class="mt-4 overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Estado</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead class="hidden md:table-cell">Marcado</TableHead>
          <TableHead class="hidden lg:table-cell">CallerID</TableHead>
          <TableHead class="hidden md:table-cell">Inicio</TableHead>
          <TableHead>Tiempos</TableHead>
          <TableHead v-if="canExecute" class="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="c in calls" :key="c.id" :class="c.state === 'ended' && 'opacity-60'">
          <TableCell>
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full" :class="stateMeta[c.state].dot" />
              <span>{{ stateMeta[c.state].label }}</span>
              <Badge v-if="c.queue" variant="outline" class="font-mono text-[10px]">{{ c.queue }}</Badge>
            </div>
          </TableCell>
          <TableCell class="font-medium"><component :is="dirIcon(c.direction)" class="mr-1 inline size-3.5 text-muted-foreground" />{{ partyLabel(c.caller) }}</TableCell>
          <TableCell class="font-medium">{{ partyLabel(c.callee) }}</TableCell>
          <TableCell class="hidden font-mono text-xs md:table-cell">{{ c.dialed ?? '—' }}</TableCell>
          <TableCell class="hidden text-xs text-muted-foreground lg:table-cell">{{ c.caller.name ? `${c.caller.name} <${c.caller.number ?? ''}>` : (c.caller.number ?? '—') }}</TableCell>
          <TableCell class="hidden text-xs md:table-cell">{{ formatDateTime(c.startedAt) }}</TableCell>
          <TableCell><CallTimers :call="c" :now="now" compact /></TableCell>
          <TableCell v-if="canExecute">
            <div v-if="c.state !== 'ended'" class="flex gap-1">
              <Button :variant="listeningId === c.id ? 'default' : 'ghost'" size="icon-sm" :disabled="caps.data.value && !caps.data.value.audiofork" aria-label="Escuchar" @click="toggleListen(c)"><HeadphonesIcon /></Button>
              <Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Colgar" @click="hangupTarget = c"><PhoneOffIcon /></Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </Card>

  <ConfirmDialog
    :open="!!hangupTarget"
    title="Colgar llamada"
    :description="hangupTarget ? `Se colgarán todos los canales de la llamada ${partyLabel(hangupTarget.caller)} → ${partyLabel(hangupTarget.callee)}.` : ''"
    confirm-label="Colgar"
    destructive
    :loading="hangup.isPending.value"
    @update:open="(v) => !v && (hangupTarget = null)"
    @confirm="hangupTarget && hangup.mutate(hangupTarget.id)"
  />
</template>
