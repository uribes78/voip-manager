<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { FilterXIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/common/PageHeader.vue';
import KpiCard from '@/components/common/KpiCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import TablePagination from '@/components/common/TablePagination.vue';
import { cdrService, type CdrFilters } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatDuration } from '@/lib/format';

const today = new Date();
const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
const toInput = (d: Date) => d.toISOString().slice(0, 10);

const filters = reactive({ page: 1, pageSize: 25, from: toInput(weekAgo), to: toInput(today), src: '', dst: '', disposition: '' });

const apiFilters = computed<CdrFilters>(() => ({
  page: filters.page,
  pageSize: filters.pageSize,
  from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
  to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
  src: filters.src || undefined,
  dst: filters.dst || undefined,
  disposition: (filters.disposition || undefined) as CdrFilters['disposition'],
}));

const list = useQuery({ queryKey: computed(() => ['cdr', 'list', apiFilters.value]), queryFn: () => cdrService.list(apiFilters.value) });
const stats = useQuery({
  queryKey: computed(() => ['cdr', 'stats', { ...apiFilters.value, page: undefined, pageSize: undefined }]),
  queryFn: () => cdrService.stats(apiFilters.value),
});

function reset() {
  Object.assign(filters, { page: 1, from: toInput(weekAgo), to: toInput(today), src: '', dst: '', disposition: '' });
}
function dispositionVariant(d: string) {
  if (d === 'ANSWERED') return 'default';
  if (d === 'NO ANSWER') return 'secondary';
  return 'destructive';
}
const dispositions = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED', 'CONGESTION'];
const answerRate = computed(() => {
  const s = stats.data.value;
  return s && s.total > 0 ? `${Math.round((s.answered / s.total) * 100)} %` : '—';
});
</script>

<template>
  <PageHeader title="Registro de llamadas (CDR)" description="Detalle de llamadas almacenado por cdr_adaptive_odbc." />

  <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
    <KpiCard label="Llamadas" :loading="stats.isPending.value" :value="stats.data.value?.total" />
    <KpiCard label="Contestadas" :loading="stats.isPending.value" :value="stats.data.value?.answered" :hint="`Tasa ${answerRate}`" tone="success" />
    <KpiCard label="Sin respuesta" :loading="stats.isPending.value" :value="stats.data.value?.noAnswer" tone="warning" />
    <KpiCard label="Ocupado / fallidas" :loading="stats.isPending.value" :value="(stats.data.value?.busy ?? 0) + (stats.data.value?.failed ?? 0)" tone="danger" />
    <KpiCard label="Duración promedio" :loading="stats.isPending.value" :value="formatDuration(Math.round(stats.data.value?.avgBillsec ?? 0))" :hint="`Total ${formatDuration(stats.data.value?.totalBillsec)}`" />
  </div>

  <Card class="mt-6 overflow-hidden">
    <div class="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div class="space-y-1"><Label class="text-xs">Desde</Label><Input v-model="filters.from" type="date" @change="filters.page = 1" /></div>
      <div class="space-y-1"><Label class="text-xs">Hasta</Label><Input v-model="filters.to" type="date" @change="filters.page = 1" /></div>
      <div class="space-y-1"><Label class="text-xs">Origen</Label><Input v-model.lazy="filters.src" placeholder="1001" class="font-mono" @change="filters.page = 1" /></div>
      <div class="space-y-1"><Label class="text-xs">Destino</Label><Input v-model.lazy="filters.dst" placeholder="55…" class="font-mono" @change="filters.page = 1" /></div>
      <div class="space-y-1">
        <Label class="text-xs">Resultado</Label>
        <Select :model-value="filters.disposition || 'all'" @update:model-value="(v) => { filters.disposition = v === 'all' ? '' : String(v); filters.page = 1; }">
          <SelectTrigger class="w-full"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem v-for="d in dispositions" :key="d" :value="d">{{ d }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-end"><Button variant="outline" class="w-full" @click="reset"><FilterXIcon /> Limpiar</Button></div>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Inicio</TableHead>
          <TableHead>Origen</TableHead>
          <TableHead>Destino</TableHead>
          <TableHead class="hidden md:table-cell">Contexto</TableHead>
          <TableHead class="hidden lg:table-cell">Canal destino</TableHead>
          <TableHead class="text-right">Duración</TableHead>
          <TableHead class="text-right">Facturable</TableHead>
          <TableHead>Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableSkeleton v-if="list.isPending.value" :cols="8" />
        <TableRow v-else-if="list.isError.value">
          <TableCell colspan="8" class="p-0"><EmptyState title="Error al cargar" :description="errorMessage(list.error.value)" /></TableCell>
        </TableRow>
        <TableRow v-else-if="!list.data.value?.items.length">
          <TableCell colspan="8" class="p-0"><EmptyState title="Sin registros" description="No hay llamadas en el rango o filtros seleccionados." /></TableCell>
        </TableRow>
        <TableRow v-for="r in list.data.value?.items" :key="r.uniqueid">
          <TableCell class="text-xs whitespace-nowrap">{{ formatDateTime(r.start) }}</TableCell>
          <TableCell>
            <p class="font-mono text-sm">{{ r.src }}</p>
            <p class="max-w-40 truncate text-xs text-muted-foreground">{{ r.clid }}</p>
          </TableCell>
          <TableCell class="font-mono text-sm">{{ r.dst }}</TableCell>
          <TableCell class="hidden font-mono text-xs md:table-cell">{{ r.dcontext }}</TableCell>
          <TableCell class="hidden max-w-48 truncate font-mono text-xs text-muted-foreground lg:table-cell">{{ r.dstchannel ?? '—' }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatDuration(r.duration) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatDuration(r.billsec) }}</TableCell>
          <TableCell><Badge :variant="dispositionVariant(r.disposition)">{{ r.disposition }}</Badge></TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <TablePagination v-model:page="filters.page" v-model:page-size="filters.pageSize" :total="list.data.value?.total ?? 0" />
  </Card>
</template>
