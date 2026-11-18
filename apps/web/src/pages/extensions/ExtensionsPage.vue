<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { toast } from 'vue-sonner';
import { CopyIcon, MoreHorizontalIcon, PencilIcon, PhoneOutgoingIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from '@lucide/vue';
import type { ExtensionSummary } from '@voip-manager/shared';
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
import CloneExtensionDialog from './CloneExtensionDialog.vue';
import OriginateDialog from './OriginateDialog.vue';
import { extensionsService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';

const auth = useAuthStore();
const realtime = useRealtimeStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('extensions:write'));
const canOriginate = computed(() => auth.hasPermission('ami:execute'));

const filters = reactive({ page: 1, pageSize: 25, search: '', context: '', includeDeleted: false });
const search = ref('');
const debouncedSearch = refDebounced(search, 300);
watch(debouncedSearch, (v) => {
  filters.search = v;
  filters.page = 1;
});
watch(() => [filters.context, filters.includeDeleted], () => (filters.page = 1));

const query = useQuery({
  queryKey: computed(() => ['extensions', { ...filters }]),
  queryFn: () =>
    extensionsService.list({
      page: filters.page,
      pageSize: filters.pageSize,
      search: filters.search || undefined,
      context: filters.context || undefined,
      includeDeleted: filters.includeDeleted,
    }),
});

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['extensions'] });
}

const target = ref<ExtensionSummary | null>(null);
const deleteOpen = ref(false);
const cloneOpen = ref(false);
const originateOpen = ref(false);

const remove = useMutation({
  mutationFn: (id: string) => extensionsService.remove(id),
  onSuccess: () => {
    toast.success(`Extensión ${target.value?.id} eliminada`);
    deleteOpen.value = false;
    invalidate();
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});

const restore = useMutation({
  mutationFn: (id: string) => extensionsService.restore(id),
  onSuccess: (ext) => {
    toast.success(`Extensión ${ext.id} restaurada`);
    invalidate();
  },
  onError: (e) => toast.error('No se pudo restaurar', { description: errorMessage(e) }),
});

function liveStatus(row: ExtensionSummary) {
  const live = realtime.endpointStatus(row.id);
  return live ? { online: live.online, deviceState: live.deviceState } : { online: row.online, deviceState: row.deviceState };
}

function openDialog(row: ExtensionSummary, which: 'delete' | 'clone' | 'originate') {
  target.value = row;
  if (which === 'delete') deleteOpen.value = true;
  if (which === 'clone') cloneOpen.value = true;
  if (which === 'originate') originateOpen.value = true;
}
</script>

<template>
  <PageHeader title="Extensiones PJSIP" description="Endpoints, AOR y credenciales almacenados en las tablas realtime ps_*.">
    <Button v-if="canWrite" as-child>
      <RouterLink to="/extensions/new"><PlusIcon /> Nueva extensión</RouterLink>
    </Button>
  </PageHeader>

  <Card class="overflow-hidden">
    <div class="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end">
      <div class="relative flex-1">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" placeholder="Buscar por extensión, nombre o descripción…" class="pl-8" />
      </div>
      <div class="w-full sm:w-48">
        <Input v-model="filters.context" placeholder="Contexto" />
      </div>
      <div class="flex items-center gap-2 pb-1.5">
        <Switch id="includeDeleted" :model-value="filters.includeDeleted" @update:model-value="(v: boolean) => (filters.includeDeleted = v)" />
        <Label for="includeDeleted" class="text-sm">Incluir eliminadas</Label>
      </div>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Extensión</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead class="hidden md:table-cell">Contexto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead class="hidden lg:table-cell">Actualizada</TableHead>
          <TableHead class="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableSkeleton v-if="query.isPending.value" :cols="6" />
        <TableRow v-else-if="query.isError.value">
          <TableCell colspan="6" class="p-0">
            <EmptyState title="Error al cargar" :description="errorMessage(query.error.value)">
              <Button variant="outline" size="sm" @click="query.refetch()">Reintentar</Button>
            </EmptyState>
          </TableCell>
        </TableRow>
        <TableRow v-else-if="!query.data.value?.items.length">
          <TableCell colspan="6" class="p-0">
            <EmptyState title="Sin extensiones" description="No hay extensiones que coincidan con los filtros.">
              <Button v-if="canWrite" as-child size="sm"><RouterLink to="/extensions/new"><PlusIcon /> Crear la primera</RouterLink></Button>
            </EmptyState>
          </TableCell>
        </TableRow>
        <TableRow v-for="row in query.data.value?.items" :key="row.id" :class="row.deletedAt && 'opacity-60'">
          <TableCell class="font-mono font-medium">{{ row.id }}</TableCell>
          <TableCell>
            <p class="font-medium">{{ row.displayName }}</p>
            <p v-if="row.description" class="truncate text-xs text-muted-foreground">{{ row.description }}</p>
          </TableCell>
          <TableCell class="hidden font-mono text-xs md:table-cell">{{ row.context }}</TableCell>
          <TableCell>
            <StatusBadge v-if="row.deletedAt" deleted />
            <StatusBadge v-else v-bind="liveStatus(row)" />
          </TableCell>
          <TableCell class="hidden text-xs text-muted-foreground lg:table-cell">{{ formatDateTime(row.updatedAt) }}</TableCell>
          <TableCell>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontalIcon /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <template v-if="row.deletedAt">
                  <DropdownMenuItem v-if="canWrite" @select="restore.mutate(row.id)"><RotateCcwIcon /> Restaurar</DropdownMenuItem>
                </template>
                <template v-else>
                  <DropdownMenuItem as-child><RouterLink :to="`/extensions/${row.id}/edit`"><PencilIcon /> {{ canWrite ? 'Editar' : 'Ver' }}</RouterLink></DropdownMenuItem>
                  <DropdownMenuItem v-if="canWrite" @select="openDialog(row, 'clone')"><CopyIcon /> Clonar</DropdownMenuItem>
                  <DropdownMenuItem v-if="canOriginate" @select="openDialog(row, 'originate')"><PhoneOutgoingIcon /> Probar llamada</DropdownMenuItem>
                  <template v-if="canWrite">
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" @select="openDialog(row, 'delete')"><Trash2Icon /> Eliminar</DropdownMenuItem>
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
    :title="`¿Eliminar la extensión ${target?.id}?`"
    description="Se borran las filas de ps_endpoints, ps_aors y ps_auths; el teléfono dejará de registrarse. Se conserva un respaldo para poder restaurarla."
    confirm-label="Eliminar"
    destructive
    :loading="remove.isPending.value"
    @confirm="target && remove.mutate(target.id)"
  />
  <CloneExtensionDialog v-model:open="cloneOpen" :source="target" @cloned="invalidate" />
  <OriginateDialog v-model:open="originateOpen" :from="target?.id" :context="target?.context" />
</template>
