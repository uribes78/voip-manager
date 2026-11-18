<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { FileInputIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import type { DialplanLine } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import CopyButton from '@/components/common/CopyButton.vue';
import DialplanLineDialog from './DialplanLineDialog.vue';
import ImportDialplanDialog from './ImportDialplanDialog.vue';
import { formatDialplan } from './parseDialplan';
import { dialplanService } from '@/services';
import { errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('dialplan:write'));

const contexts = useQuery({ queryKey: ['dialplan', 'contexts'], queryFn: dialplanService.contexts });
const selected = ref<string | null>(null);

watch(
  () => contexts.data.value,
  (list) => {
    if (!list?.length) return;
    if (!selected.value || !list.some((c) => c.context === selected.value)) selected.value = list[0]!.context;
  },
  { immediate: true },
);

const lines = useQuery({
  queryKey: computed(() => ['dialplan', 'lines', selected.value]),
  queryFn: () => dialplanService.lines(selected.value!),
  enabled: computed(() => !!selected.value),
});

const grouped = computed(() => {
  const map = new Map<string, DialplanLine[]>();
  for (const l of lines.data.value ?? []) {
    const arr = map.get(l.exten) ?? [];
    arr.push(l);
    map.set(l.exten, arr);
  }
  return [...map.entries()].map(([exten, ls]) => ({ exten, lines: ls.sort((a, b) => a.priority - b.priority) }));
});

const asText = computed(() => (selected.value && lines.data.value ? formatDialplan(selected.value, lines.data.value) : ''));

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['dialplan'] });
}

const lineDialogOpen = ref(false);
const editing = ref<DialplanLine | null>(null);
const importOpen = ref(false);
const importNewContext = ref(false);
const deleteLineTarget = ref<DialplanLine | null>(null);
const deleteLineOpen = ref(false);
const deleteContextOpen = ref(false);

function newLine(exten?: string, afterPriority?: number) {
  editing.value = exten
    ? { id: 0, context: selected.value!, exten, priority: (afterPriority ?? 0) + 1, app: '', appdata: '' }
    : null;
  lineDialogOpen.value = true;
}

const removeLine = useMutation({
  mutationFn: (id: number) => dialplanService.removeLine(id),
  onSuccess: () => {
    toast.success('Línea eliminada');
    deleteLineOpen.value = false;
    invalidate();
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});
const removeContext = useMutation({
  mutationFn: (ctx: string) => dialplanService.removeContext(ctx),
  onSuccess: () => {
    toast.success(`Contexto ${selected.value} eliminado`);
    deleteContextOpen.value = false;
    selected.value = null;
    invalidate();
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});
</script>

<template>
  <PageHeader title="Plan de marcado" description="Contextos y prioridades en la tabla extensions (pbx_realtime).">
    <Button v-if="canWrite" variant="outline" @click="importNewContext = true; importOpen = true"><FileInputIcon /> Nuevo contexto / importar</Button>
    <Button v-if="canWrite" :disabled="!selected" @click="newLine()"><PlusIcon /> Nueva línea</Button>
  </PageHeader>

  <div class="grid gap-6 lg:grid-cols-[260px_1fr]">
    <Card class="overflow-hidden">
      <CardHeader class="pb-2"><CardTitle class="text-sm">Contextos</CardTitle></CardHeader>
      <CardContent class="p-0">
        <div v-if="contexts.isPending.value" class="space-y-2 p-3"><Skeleton v-for="i in 4" :key="i" class="h-8" /></div>
        <EmptyState v-else-if="!contexts.data.value?.length" title="Sin contextos" description="Importa un contexto para empezar." class="py-8" />
        <ScrollArea v-else class="max-h-[60vh]">
          <nav class="p-2">
            <button
              v-for="c in contexts.data.value"
              :key="c.context"
              type="button"
              class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              :class="selected === c.context && 'bg-muted font-medium'"
              @click="selected = c.context"
            >
              <span class="truncate font-mono">{{ c.context }}</span>
              <Badge variant="outline" class="ml-2 tabular-nums">{{ c.lines }}</Badge>
            </button>
          </nav>
        </ScrollArea>
      </CardContent>
    </Card>

    <Card class="overflow-hidden">
      <CardHeader class="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle class="font-mono">{{ selected ?? 'Selecciona un contexto' }}</CardTitle>
          <CardDescription v-if="selected">{{ grouped.length }} extensiones · {{ lines.data.value?.length ?? 0 }} prioridades</CardDescription>
        </div>
        <div v-if="selected" class="flex gap-2">
          <CopyButton :text="asText" label="Copiar como texto" />
          <Button v-if="canWrite" variant="outline" size="sm" @click="importNewContext = false; importOpen = true"><FileInputIcon /> Importar</Button>
          <Button v-if="canWrite" variant="destructive" size="sm" @click="deleteContextOpen = true"><Trash2Icon /> Eliminar contexto</Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <Table v-if="selected">
          <TableHeader>
            <TableRow>
              <TableHead class="w-40">Exten</TableHead>
              <TableHead class="w-16 text-right">Prio</TableHead>
              <TableHead>Aplicación</TableHead>
              <TableHead>Argumentos</TableHead>
              <TableHead class="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="lines.isPending.value"><TableCell colspan="5"><Skeleton class="h-5" /></TableCell></TableRow>
            <TableRow v-else-if="!lines.data.value?.length">
              <TableCell colspan="5" class="p-0">
                <EmptyState title="Contexto vacío" description="Agrega líneas o importa desde texto.">
                  <Button v-if="canWrite" size="sm" @click="newLine()"><PlusIcon /> Nueva línea</Button>
                </EmptyState>
              </TableCell>
            </TableRow>
            <template v-for="group in grouped" :key="group.exten">
              <TableRow v-for="(l, i) in group.lines" :key="l.id" class="group">
                <TableCell class="font-mono font-medium">
                  <span v-if="i === 0">{{ l.exten }}</span>
                  <span v-else class="text-muted-foreground">same</span>
                </TableCell>
                <TableCell class="text-right font-mono text-xs tabular-nums">{{ l.priority }}</TableCell>
                <TableCell class="font-mono text-xs">{{ l.app }}</TableCell>
                <TableCell class="max-w-md truncate font-mono text-xs text-muted-foreground">{{ l.appdata }}</TableCell>
                <TableCell>
                  <div v-if="canWrite" class="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button variant="ghost" size="icon-xs" aria-label="Agregar después" @click="newLine(l.exten, l.priority)"><PlusIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Editar" @click="editing = l; lineDialogOpen = true"><PencilIcon /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Eliminar" @click="deleteLineTarget = l; deleteLineOpen = true"><Trash2Icon class="text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
        <EmptyState v-else title="Sin contexto seleccionado" description="Elige un contexto de la lista o crea uno nuevo." />
      </CardContent>
    </Card>
  </div>

  <DialplanLineDialog v-model:open="lineDialogOpen" :context="selected ?? ''" :line="editing" @saved="invalidate" />
  <ImportDialplanDialog v-model:open="importOpen" :context="importNewContext ? '' : (selected ?? '')" @imported="(ctx) => { selected = ctx; invalidate(); }" />
  <ConfirmDialog
    v-model:open="deleteLineOpen"
    title="¿Eliminar esta prioridad?"
    :description="deleteLineTarget ? `${deleteLineTarget.exten},${deleteLineTarget.priority},${deleteLineTarget.app}(${deleteLineTarget.appdata})` : ''"
    confirm-label="Eliminar"
    destructive
    :loading="removeLine.isPending.value"
    @confirm="deleteLineTarget && removeLine.mutate(deleteLineTarget.id)"
  />
  <ConfirmDialog
    v-model:open="deleteContextOpen"
    :title="`¿Eliminar el contexto ${selected}?`"
    description="Se borran todas sus extensiones y prioridades. Las llamadas que usen este contexto fallarán."
    confirm-label="Eliminar contexto"
    destructive
    :loading="removeContext.isPending.value"
    @confirm="selected && removeContext.mutate(selected)"
  />
</template>
