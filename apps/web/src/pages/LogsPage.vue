<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useIntervalFn } from '@vueuse/core';
import { RefreshCwIcon } from '@lucide/vue';
import type { LogLine } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/common/PageHeader.vue';
import KpiCard from '@/components/common/KpiCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { logsService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';

const filters = reactive({ source: 'asterisk' as 'asterisk' | 'service', lines: 300, grep: '', level: '' });
const autoRefresh = ref(false);
const onlyProblems = ref(false);
const viewer = ref<HTMLElement | null>(null);

const query = useQuery({
  queryKey: computed(() => ['logs', { ...filters }]),
  queryFn: () =>
    logsService.read({
      source: filters.source,
      lines: filters.lines,
      grep: filters.grep || undefined,
      level: (filters.level || undefined) as 'ERROR' | 'WARNING' | 'NOTICE' | 'VERBOSE' | 'DEBUG' | 'DTMF' | 'SECURITY' | undefined,
    }),
});

const { pause, resume } = useIntervalFn(() => query.refetch(), 5000, { immediate: false });
watch(autoRefresh, (v) => (v ? resume() : pause()), { immediate: true });

watch(
  () => query.data.value,
  () => {
    requestAnimationFrame(() => {
      if (viewer.value) viewer.value.scrollTop = viewer.value.scrollHeight;
    });
  },
);

const visibleLines = computed(() => {
  const lines = query.data.value?.lines ?? [];
  return onlyProblems.value ? lines.filter((l) => l.level === 'ERROR' || l.level === 'WARNING') : lines;
});

function levelClass(l: LogLine) {
  switch (l.level) {
    case 'ERROR':
      return 'text-red-600 dark:text-red-400';
    case 'WARNING':
      return 'text-amber-600 dark:text-amber-400';
    case 'NOTICE':
      return 'text-sky-600 dark:text-sky-400';
    case 'SECURITY':
      return 'text-fuchsia-600 dark:text-fuchsia-400';
    case 'DEBUG':
      return 'text-muted-foreground';
    default:
      return 'text-foreground/80';
  }
}
const levels = ['ERROR', 'WARNING', 'NOTICE', 'VERBOSE', 'DEBUG', 'SECURITY'];
</script>

<template>
  <PageHeader title="Logs" description="Lectura del log de Asterisk o del propio servicio para detectar errores e inconsistencias.">
    <div class="flex items-center gap-2">
      <Switch id="auto" :model-value="autoRefresh" @update:model-value="(v: boolean) => (autoRefresh = v)" />
      <Label for="auto" class="text-sm">Auto-refrescar (5 s)</Label>
    </div>
    <Button variant="outline" :disabled="query.isFetching.value" @click="query.refetch()"><RefreshCwIcon :class="query.isFetching.value && 'animate-spin'" /> Actualizar</Button>
  </PageHeader>

  <div class="grid gap-4 sm:grid-cols-3">
    <KpiCard label="Errores" :loading="query.isPending.value" :value="query.data.value?.summary.errors" tone="danger" />
    <KpiCard label="Advertencias" :loading="query.isPending.value" :value="query.data.value?.summary.warnings" tone="warning" />
    <KpiCard label="Avisos" :loading="query.isPending.value" :value="query.data.value?.summary.notices" :hint="query.data.value ? `${query.data.value.path} · ${formatBytes(query.data.value.sizeBytes)}` : undefined" />
  </div>

  <Card class="mt-6 overflow-hidden">
    <div class="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-end">
      <Tabs :model-value="filters.source" @update:model-value="(v) => (filters.source = v as 'asterisk' | 'service')">
        <TabsList>
          <TabsTrigger value="asterisk">Asterisk</TabsTrigger>
          <TabsTrigger value="service">Servicio</TabsTrigger>
        </TabsList>
      </Tabs>
      <div class="flex-1 space-y-1"><Label class="text-xs">Filtrar (grep)</Label><Input v-model.lazy="filters.grep" placeholder="PJSIP/1001, Registration, ODBC…" class="font-mono" /></div>
      <div class="w-full space-y-1 lg:w-40">
        <Label class="text-xs">Nivel</Label>
        <Select :model-value="filters.level || 'all'" @update:model-value="(v) => (filters.level = v === 'all' ? '' : String(v))">
          <SelectTrigger class="w-full"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem v-for="l in levels" :key="l" :value="l">{{ l }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="w-full space-y-1 lg:w-32">
        <Label class="text-xs">Líneas</Label>
        <Select :model-value="String(filters.lines)" @update:model-value="(v) => (filters.lines = Number(v))">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="n in [100, 300, 1000, 3000]" :key="n" :value="String(n)">{{ n }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center gap-2 pb-1.5">
        <Switch id="problems" :model-value="onlyProblems" @update:model-value="(v: boolean) => (onlyProblems = v)" />
        <Label for="problems" class="text-sm">Solo problemas</Label>
      </div>
    </div>

    <div v-if="query.isPending.value" class="space-y-2 p-4"><Skeleton v-for="i in 8" :key="i" class="h-4" /></div>
    <EmptyState v-else-if="query.isError.value" title="No se pudo leer el log" :description="errorMessage(query.error.value)" />
    <EmptyState v-else-if="query.data.value && !query.data.value.exists" title="Archivo no encontrado" :description="`No existe ${query.data.value.path}. Revisa ASTERISK_LOG_PATH / SERVICE_LOG_PATH en el servidor.`" />
    <EmptyState v-else-if="!visibleLines.length" title="Sin líneas" description="No hay entradas que coincidan con los filtros." />
    <div v-else ref="viewer" class="max-h-[60vh] overflow-auto bg-zinc-950 p-3 font-mono text-[12px] leading-5 text-zinc-200">
      <div v-for="(l, i) in visibleLines" :key="i" class="flex gap-2 whitespace-pre-wrap break-all hover:bg-white/5">
        <span class="shrink-0 text-zinc-500 select-none">{{ l.timestamp ?? '' }}</span>
        <Badge v-if="l.level" variant="outline" class="h-4 shrink-0 border-zinc-700 px-1 text-[10px]" :class="levelClass(l)">{{ l.level }}</Badge>
        <span v-if="l.module" class="shrink-0 text-zinc-400">{{ l.module }}</span>
        <span :class="levelClass(l)">{{ l.message }}</span>
      </div>
    </div>
  </Card>
</template>
