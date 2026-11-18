<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { refDebounced } from '@vueuse/core';
import { toast } from 'vue-sonner';
import { EyeIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from '@lucide/vue';
import type { Queue } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import TablePagination from '@/components/common/TablePagination.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import { queuesService } from '@/services';
import { errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('queues:write'));

const filters = reactive({ page: 1, pageSize: 25, search: '' });
const search = ref('');
const debounced = refDebounced(search, 300);
watch(debounced, (v) => {
  filters.search = v;
  filters.page = 1;
});

const query = useQuery({
  queryKey: computed(() => ['queues', { ...filters }]),
  queryFn: () => queuesService.list({ ...filters, search: filters.search || undefined }),
});

const target = ref<Queue | null>(null);
const deleteOpen = ref(false);
const remove = useMutation({
  mutationFn: (name: string) => queuesService.remove(name),
  onSuccess: () => {
    toast.success(`Cola ${target.value?.name} eliminada`);
    deleteOpen.value = false;
    queryClient.invalidateQueries({ queryKey: ['queues'] });
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});
</script>

<template>
  <PageHeader title="Colas de atención" description="Colas tipo call center (app_queue) y sus agentes.">
    <Button v-if="canWrite" as-child><RouterLink to="/queues/new"><PlusIcon /> Nueva cola</RouterLink></Button>
  </PageHeader>

  <Card class="overflow-hidden">
    <div class="border-b p-4">
      <div class="relative max-w-md">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" placeholder="Buscar cola…" class="pl-8" />
      </div>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cola</TableHead>
          <TableHead>Estrategia</TableHead>
          <TableHead class="hidden md:table-cell">Timeout</TableHead>
          <TableHead class="hidden md:table-cell">Máx. en espera</TableHead>
          <TableHead>Miembros</TableHead>
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
            <EmptyState title="Sin colas" description="Crea una cola y agrega extensiones como miembros.">
              <Button v-if="canWrite" as-child size="sm"><RouterLink to="/queues/new"><PlusIcon /> Crear cola</RouterLink></Button>
            </EmptyState>
          </TableCell>
        </TableRow>
        <TableRow v-for="row in query.data.value?.items" :key="row.name" class="cursor-pointer" @click="$router.push(`/queues/${row.name}`)">
          <TableCell>
            <p class="font-mono font-medium">{{ row.name }}</p>
            <p v-if="row.description" class="truncate text-xs text-muted-foreground">{{ row.description }}</p>
          </TableCell>
          <TableCell><Badge variant="outline">{{ row.strategy }}</Badge></TableCell>
          <TableCell class="hidden tabular-nums md:table-cell">{{ row.timeout }} s</TableCell>
          <TableCell class="hidden tabular-nums md:table-cell">{{ row.maxlen === 0 ? 'Sin límite' : row.maxlen }}</TableCell>
          <TableCell class="tabular-nums">{{ row.membersCount }}</TableCell>
          <TableCell @click.stop>
            <DropdownMenu>
              <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem as-child><RouterLink :to="`/queues/${row.name}`"><EyeIcon /> Ver miembros</RouterLink></DropdownMenuItem>
                <DropdownMenuItem v-if="canWrite" as-child><RouterLink :to="`/queues/${row.name}/edit`"><PencilIcon /> Editar</RouterLink></DropdownMenuItem>
                <template v-if="canWrite">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" @select="target = row; deleteOpen = true"><Trash2Icon /> Eliminar</DropdownMenuItem>
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
    :title="`¿Eliminar la cola ${target?.name}?`"
    description="Se eliminan la cola y todos sus miembros. Las llamadas que lleguen a esta cola fallarán."
    confirm-label="Eliminar"
    destructive
    :loading="remove.isPending.value"
    @confirm="target && remove.mutate(target.name)"
  />
</template>
