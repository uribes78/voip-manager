<script setup lang="ts">
import { computed, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { ActivityIcon, PhoneCallIcon, PhoneForwardedIcon, RadioIcon, UsersRoundIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import KpiCard from '@/components/common/KpiCard.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import { amiService } from '@/services';
import { useRealtimeStore } from '@/stores/realtime';
import { formatDateTime } from '@/lib/format';

const realtime = useRealtimeStore();

// Respaldo por HTTP cuando el WebSocket no está conectado.
const snapshot = useQuery({
  queryKey: ['ami', 'dashboard'],
  queryFn: amiService.dashboard,
  refetchInterval: computed(() => (realtime.wsState === 'connected' ? false : 15_000)),
});

watch(
  () => snapshot.data.value,
  (data) => {
    if (data && realtime.wsState !== 'connected') realtime.applySnapshot(data);
  },
  { immediate: true },
);

const loading = computed(() => !realtime.kpi && snapshot.isPending.value);
const extensions = computed(() => realtime.endpointList.filter((e) => e.type === 'extension'));
const trunks = computed(() => realtime.endpointList.filter((e) => e.type === 'trunk'));

/** '20.6.0~dfsg+~cs6.13…' -> '20.6.0' */
function shortVersion(v: string) {
  return /^\d+(\.\d+){0,2}/.exec(v)?.[0] ?? v;
}
function regVariant(status: string) {
  const s = status.toLowerCase();
  if (s === 'registered') return 'default';
  if (s === 'rejected') return 'destructive';
  return 'secondary';
}
</script>

<template>
  <PageHeader title="Dashboard" description="Estado en tiempo real de Asterisk, extensiones y troncales.">
    <Badge variant="outline" class="gap-1.5">
      <span class="size-1.5 rounded-full" :class="realtime.wsState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'" />
      {{ realtime.wsState === 'connected' ? 'Eventos en vivo' : 'Actualización periódica' }}
    </Badge>
  </PageHeader>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <KpiCard label="Extensiones" hint="en línea / total" :loading="loading" :value="`${realtime.kpi?.onlineExtensions ?? 0} / ${realtime.kpi?.totalExtensions ?? 0}`" tone="success">
      <template #icon><PhoneCallIcon class="size-4" /></template>
    </KpiCard>
    <KpiCard label="Troncales" hint="en línea / total" :loading="loading" :value="`${realtime.kpi?.onlineTrunks ?? 0} / ${realtime.kpi?.totalTrunks ?? 0}`" :tone="(realtime.kpi?.totalTrunks ?? 0) > 0 && realtime.kpi?.onlineTrunks === 0 ? 'danger' : 'default'">
      <template #icon><PhoneForwardedIcon class="size-4" /></template>
    </KpiCard>
    <KpiCard label="Llamadas activas" :loading="loading" :value="realtime.kpi?.activeCalls">
      <template #icon><ActivityIcon class="size-4" /></template>
    </KpiCard>
    <KpiCard label="Colas" :loading="loading" :value="realtime.kpi?.queues">
      <template #icon><UsersRoundIcon class="size-4" /></template>
    </KpiCard>
    <KpiCard
      label="AMI"
      :loading="loading"
      :value="realtime.ami?.connected ? 'Conectado' : 'Desconectado'"
      :tone="realtime.ami?.connected ? 'success' : 'danger'"
      :hint="realtime.ami?.asteriskVersion ? `Asterisk ${shortVersion(realtime.ami.asteriskVersion)}` : realtime.ami?.lastError ?? undefined"
    >
      <template #icon><RadioIcon class="size-4" /></template>
    </KpiCard>
  </div>

  <div class="mt-5 grid gap-4 xl:grid-cols-[2fr_1fr]">
    <Card class="overflow-hidden">
      <CardHeader>
        <CardTitle>Extensiones</CardTitle>
        <CardDescription>Estado de dispositivo y contactos registrados.</CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Extensión</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead class="hidden md:table-cell">Contacto</TableHead>
              <TableHead class="hidden lg:table-cell">User-Agent</TableHead>
              <TableHead class="text-right">Canales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableSkeleton v-if="loading" :cols="5" />
            <TableRow v-else-if="extensions.length === 0">
              <TableCell colspan="5" class="p-0"><EmptyState title="Sin extensiones" description="Crea extensiones para verlas aquí." /></TableCell>
            </TableRow>
            <TableRow v-for="e in extensions" :key="e.endpoint">
              <TableCell class="font-medium">
                <RouterLink :to="`/extensions/${e.endpoint}/edit`" class="hover:underline">{{ e.endpoint }}</RouterLink>
              </TableCell>
              <TableCell><StatusBadge :online="e.online" :device-state="e.deviceState" /></TableCell>
              <TableCell class="hidden max-w-60 truncate font-mono text-xs text-muted-foreground md:table-cell">
                {{ e.contacts[0]?.uri ?? '—' }}
                <span v-if="e.contacts[0]?.rtt != null" class="ml-1">({{ e.contacts[0]?.rtt }} ms)</span>
              </TableCell>
              <TableCell class="hidden max-w-48 truncate text-xs text-muted-foreground lg:table-cell">{{ e.contacts[0]?.userAgent ?? '—' }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ e.activeChannels }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div class="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Troncales</CardTitle>
          <CardDescription>Disponibilidad por qualify.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <p v-if="trunks.length === 0" class="text-sm text-muted-foreground">Sin troncales configuradas.</p>
          <div v-for="t in trunks" :key="t.endpoint" class="flex items-center justify-between gap-2 text-sm">
            <RouterLink :to="`/trunks/${t.endpoint}/edit`" class="truncate font-medium hover:underline">{{ t.endpoint }}</RouterLink>
            <StatusBadge :online="t.online" :device-state="t.deviceState" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros salientes</CardTitle>
          <CardDescription>Registro con carriers (ps_registrations).</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <p v-if="realtime.registrationList.length === 0" class="text-sm text-muted-foreground">Sin registros configurados.</p>
          <div v-for="r in realtime.registrationList" :key="r.registration" class="flex items-center justify-between gap-2 text-sm">
            <div class="min-w-0">
              <p class="truncate font-medium">{{ r.registration }}</p>
              <p class="truncate font-mono text-xs text-muted-foreground">{{ r.serverUri ?? '—' }}</p>
            </div>
            <Badge :variant="regVariant(r.status)">{{ r.status }}</Badge>
          </div>
        </CardContent>
      </Card>

      <p class="text-xs text-muted-foreground">Último evento: {{ formatDateTime(realtime.lastEventAt) }}</p>
    </div>
  </div>
</template>
