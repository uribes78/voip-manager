<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { MoreHorizontalIcon, PencilIcon, PlusIcon, UserXIcon } from '@lucide/vue';
import type { UserPublic } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import TablePagination from '@/components/common/TablePagination.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import UserDialog from './UserDialog.vue';
import { usersService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('users:write'));
const filters = reactive({ page: 1, pageSize: 25 });

const query = useQuery({ queryKey: computed(() => ['users', { ...filters }]), queryFn: () => usersService.list(filters) });

const dialogOpen = ref(false);
const editing = ref<UserPublic | null>(null);
const deactivateTarget = ref<UserPublic | null>(null);
const deactivateOpen = ref(false);

const deactivate = useMutation({
  mutationFn: (id: number) => usersService.deactivate(id),
  onSuccess: () => {
    toast.success('Usuario desactivado');
    deactivateOpen.value = false;
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
  onError: (e) => toast.error('No se pudo desactivar', { description: errorMessage(e) }),
});

const roleLabel: Record<string, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Lectura' };
const roleVariant: Record<string, 'default' | 'secondary' | 'outline'> = { admin: 'default', operator: 'secondary', viewer: 'outline' };
</script>

<template>
  <PageHeader title="Usuarios" description="Cuentas locales del servicio y su rol de acceso.">
    <Button v-if="canWrite" @click="editing = null; dialogOpen = true"><PlusIcon /> Nuevo usuario</Button>
  </PageHeader>

  <Card class="overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead class="hidden lg:table-cell">Último acceso</TableHead>
          <TableHead class="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableSkeleton v-if="query.isPending.value" :cols="6" />
        <TableRow v-else-if="query.isError.value"><TableCell colspan="6" class="p-0"><EmptyState title="Error al cargar" :description="errorMessage(query.error.value)" /></TableCell></TableRow>
        <TableRow v-else-if="!query.data.value?.items.length"><TableCell colspan="6" class="p-0"><EmptyState title="Sin usuarios" /></TableCell></TableRow>
        <TableRow v-for="u in query.data.value?.items" :key="u.id" :class="!u.active && 'opacity-60'">
          <TableCell class="font-mono font-medium">{{ u.username }}</TableCell>
          <TableCell>
            <p>{{ u.fullName }}</p>
            <p v-if="u.email" class="text-xs text-muted-foreground">{{ u.email }}</p>
          </TableCell>
          <TableCell><Badge :variant="roleVariant[u.role]">{{ roleLabel[u.role] }}</Badge></TableCell>
          <TableCell><Badge :variant="u.active ? 'outline' : 'destructive'">{{ u.active ? 'Activo' : 'Inactivo' }}</Badge></TableCell>
          <TableCell class="hidden text-xs text-muted-foreground lg:table-cell">{{ formatDateTime(u.lastLoginAt) }}</TableCell>
          <TableCell>
            <DropdownMenu v-if="canWrite">
              <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontalIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="editing = u; dialogOpen = true"><PencilIcon /> Editar</DropdownMenuItem>
                <template v-if="u.active && u.id !== auth.user?.id">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" @select="deactivateTarget = u; deactivateOpen = true"><UserXIcon /> Desactivar</DropdownMenuItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <TablePagination v-model:page="filters.page" v-model:page-size="filters.pageSize" :total="query.data.value?.total ?? 0" />
  </Card>

  <UserDialog v-model:open="dialogOpen" :user="editing" @saved="queryClient.invalidateQueries({ queryKey: ['users'] })" />
  <ConfirmDialog
    v-model:open="deactivateOpen"
    :title="`¿Desactivar a ${deactivateTarget?.username}?`"
    description="El usuario no podrá iniciar sesión. Puedes reactivarlo editándolo."
    confirm-label="Desactivar"
    destructive
    :loading="deactivate.isPending.value"
    @confirm="deactivateTarget && deactivate.mutate(deactivateTarget.id)"
  />
</template>
