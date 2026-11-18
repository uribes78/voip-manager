<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { toast } from 'vue-sonner';
import { MoreHorizontalIcon, PencilIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from '@lucide/vue';
import type { Trunk } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PageHeader from '@/components/common/PageHeader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import TablePagination from '@/components/common/TablePagination.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import { trunksService } from '@/services';
import { errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';

const auth = useAuthStore();
const realtime = useRealtimeStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('trunks:write'));

const filters = reactive({ page: 1, pageSize: 25, search: '', includeDeleted: false });
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, (v) => {
  filters.search = v;
  filters.page = 1;
});

const query = useQuery({
  queryKey: computed(() => ['trunks', { ...filters }]),
  queryFn: () => trunksService.list({ ...filters, search: filters.search || undefined }),
});

const target = ref<Trunk | null>(null);
const deleteOpen = ref(false);
const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trunks'] });

const remove = useMutation({
  mutationFn: (id: string) => trunksService.remove(id),
  onSuccess: () => {
    toast.success(`Troncal ${target.value?.id} eliminada`);
    deleteOpen.value = false;
    invalidate();
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});
const restore = useMutation({
  mutationFn: (id: string) => trunksService.restore(id),
  onSuccess: (t) => {
    toast.success(`Troncal ${t.id} restaurada`);
    invalidate();
  },
  onError: (e) => toast.error('No se pudo restaurar', { description: errorMessage(e) }),
});

function status(row: Trunk) {
  const live = realtime.endpointStatus(row.id);
  return live ? { online: live.online, deviceState: live.deviceState } : { online: row.online };
}
function registration(row: Trunk) {
  return realtime.registrations[row.id]?.status ?? row.registrationStatus;
}
function regVariant(s: string | undefined) {
  const v = (s ?? '').toLowerCase();
  if (v === 'registered') return 'default';
  if (v === 'rejected' || v === 'unregistered') return 'destructive';
  return 'secondary';
}
</script>

<template>
  <PageHeader title="Troncales SIP" description="Conexiones con carriers u otras PBX, identificadas como trunk en los metadatos.">
    <Button v-if="canWrite" as-child><RouterLink to="/trunks/new"><PlusIcon /> Nueva troncal</RouterLink></Button>
  </PageHeader>

  <Card class="overflow-hidden">
    <div class="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end">
      <div class="relative flex-1">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" placeholder="Buscar por nombre, host o descripción…" class="pl-8" />
      </div>
      <div class="flex items-center gap-2 pb-1.5">
        <Switch id="includeDeletedTrunks" :model-value="filters.includeDeleted" @update:model-value="(v: boolean) => { filters.includeDeleted = v; filters.page = 1; }" />
        <Label for="includeDeletedTrunks" class="text-sm">Incluir eliminadas</Label>
      </div>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Troncal</TableHead>
          <TableHead>Host</TableHead>
          <TableHead class="hidden md:table-cell">Modo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead class="hidden lg:table-cell">Registro</TableHead>
          <TableHead class="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableSkeleton v-if="query.isPending.value" :cols="6" />
        <TableRow v-else-if="query.isError.value">
          <TableCell colspan="6" class="p-0"><EmptyState title="Error al cargar" :description="errorMessage(query.error.value)"><Button variant="outline" size="sm" @click="query.refetch()">Reintentar</Button></EmptyState></TableCell>
        </TableRow>
        <TableRow v-else-if="!query.data.value?.items.length">
          <TableCell colspan="6" class="p-0">
            <EmptyState title="Sin troncales" description="Configura una troncal para enrutar llamadas externas.">
              <Button v-if="canWrite" as-child size="sm"><RouterLink to="/trunks/new"><PlusIcon /> Crear troncal</RouterLink></Button>
            </EmptyState>
          </TableCell>
        </TableRow>
        <TableRow v-for="row in query.data.value?.items" :key="row.id" :class="row.deletedAt && 'opacity-60'">
          <TableCell>
            <p class="font-mono font-medium">{{ row.id }}</p>
            <p v-if="row.description" class="truncate text-xs text-muted-foreground">{{ row.description }}</p>
          </TableCell>
          <TableCell class="font-mono text-xs">{{ row.host }}:{{ row.port }}</TableCell>
          <TableCell class="hidden md:table-cell"><Badge variant="outline">{{ row.mode === 'ip' ? 'Por IP' : 'Credenciales' }}</Badge></TableCell>
          <TableCell><StatusBadge v-if="row.deletedAt" deleted /><StatusBadge v-else v-bind="status(row)" /></TableCell>
          <TableCell class="hidden lg:table-cell">
            <Badge v-if="row.mode === 'credentials' && row.register" :variant="regVariant(registration(row))">{{ registration(row) ?? 'Sin datos' }}</Badge>
            <span v-else class="text-xs text-muted-foreground">n/a</span>
          </TableCell>
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem v-if="row.deletedAt && canWrite" @select="restore.mutate(row.id)"><RotateCcwIcon /> Restaurar</DropdownMenuItem>
                <template v-else>
                  <DropdownMenuItem as-child><RouterLink :to="`/trunks/${row.id}/edit`"><PencilIcon /> {{ canWrite ? 'Editar' : 'Ver' }}</RouterLink></DropdownMenuItem>
                  <template v-if="canWrite">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" @select="target = row; deleteOpen = true"><Trash2Icon /> Eliminar</DropdownMenuItem>
                  </template>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <TablePagination v-model:page="filters.page" v-model:page-size="filters.pageSize" :total="query.data.value?.total ?? 0" />
  </Card>

  <ConfirmDialog
    v-model:open="deleteOpen"
    :title="`¿Eliminar la troncal ${target?.id}?`"
    description="Se borran endpoint, AOR, auth, identify y registro. Las llamadas por esta troncal dejarán de funcionar."
    confirm-label="Eliminar"
    destructive
    :loading="remove.isPending.value"
    @confirm="target && remove.mutate(target.id)"
  />
</template>
