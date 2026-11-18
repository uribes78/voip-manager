<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { PencilIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import { settingsService } from '@/services';
import { errorMessage } from '@/lib/api';

const emit = defineEmits<{ edit: [file: string] }>();
const summary = useQuery({ queryKey: ['settings', 'features'], queryFn: settingsService.features, staleTime: 30_000 });

const sourceLabel: Record<string, string> = {
  featuremap: 'features.conf · featuremap',
  applicationmap: 'features.conf · applicationmap',
  parking: 'res_parking.conf',
  dialplan: 'Plan de marcado',
};
const sourceVariant: Record<string, 'default' | 'secondary' | 'outline'> = { featuremap: 'default', applicationmap: 'secondary', parking: 'outline', dialplan: 'outline' };
const codes = computed(() => [...(summary.data.value?.codes ?? [])].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
const missing = computed(() => summary.data.value?.sources.filter((s) => !s.exists).map((s) => s.file) ?? []);
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[1fr_320px]">
    <Card class="overflow-hidden">
      <CardHeader class="border-b">
        <div class="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Códigos de función</CardTitle>
            <CardDescription>
              Qué marca el usuario durante una llamada o desde el teléfono: transferencias, estacionar, grabar, capturar llamadas de grupo.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" @click="emit('edit', 'features.conf')"><PencilIcon /> Editar features.conf</Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Función</TableHead>
              <TableHead class="hidden md:table-cell">Origen</TableHead>
              <TableHead class="hidden lg:table-cell">Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableSkeleton v-if="summary.isPending.value" :cols="4" />
            <TableRow v-else-if="summary.isError.value">
              <TableCell colspan="4" class="p-0"><EmptyState title="No se pudieron leer los códigos" :description="errorMessage(summary.error.value)" /></TableCell>
            </TableRow>
            <TableRow v-else-if="codes.length === 0">
              <TableCell colspan="4" class="p-0">
                <EmptyState title="Sin códigos definidos" description="Define featuremap/applicationmap en features.conf, lotes en res_parking.conf o extensiones Pickup/Park en el dialplan." />
              </TableCell>
            </TableRow>
            <TableRow v-for="c in codes" :key="`${c.source}-${c.code}-${c.name}`">
              <TableCell class="font-mono font-semibold">{{ c.code }}</TableCell>
              <TableCell>
                <p class="font-medium">{{ c.name }}</p>
                <p v-if="c.activateOn || c.application" class="font-mono text-xs text-muted-foreground">
                  <span v-if="c.activateOn">{{ c.activateOn }} · </span>{{ c.application }}
                </p>
              </TableCell>
              <TableCell class="hidden md:table-cell"><Badge :variant="sourceVariant[c.source]">{{ sourceLabel[c.source] }}</Badge></TableCell>
              <TableCell class="hidden max-w-md truncate text-xs text-muted-foreground lg:table-cell" :title="c.description">{{ c.description }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <div class="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Lotes de estacionamiento</CardTitle>
          <CardDescription>res_parking.conf</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <p v-if="!summary.data.value?.parkingLots.length" class="text-sm text-muted-foreground">Sin lotes definidos.</p>
          <div v-for="lot in summary.data.value?.parkingLots" :key="lot.name" class="rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{{ lot.name }}</span>
              <span class="font-mono text-xs">{{ lot.parkext ?? '—' }}</span>
            </div>
            <p class="font-mono text-xs text-muted-foreground">
              espacios {{ lot.parkpos ?? '—' }} · {{ lot.context ?? 'parkedcalls' }}<span v-if="lot.parkingtime"> · {{ lot.parkingtime }} s</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" class="w-full" @click="emit('edit', 'res_parking.conf')"><PencilIcon /> Editar res_parking.conf</Button>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Cómo funciona</CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-xs text-muted-foreground">
          <p><b class="text-foreground">featuremap</b> y <b class="text-foreground">applicationmap</b> no tienen soporte Realtime en Asterisk: se guardan en <code>features.conf</code> y se aplican con <code>module reload features</code>.</p>
          <p>Los códigos de applicationmap solo actúan si el canal tiene <code>DYNAMIC_FEATURES</code>; defínelo con <code>Set(__DYNAMIC_FEATURES=nombre)</code> en el dialplan.</p>
          <p>Capturar llamadas de un grupo se hace con <code>Pickup()</code> en el plan de marcado y los grupos <i>call/pickup group</i> de cada extensión.</p>
          <p v-if="missing.length" class="text-amber-600 dark:text-amber-400">Archivos no encontrados: {{ missing.join(', ') }}.</p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
