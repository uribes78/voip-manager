<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, PauseIcon, PencilIcon, PlayIcon, Trash2Icon, UserPlusIcon } from '@lucide/vue';
import type { QueueMember } from '@voip-manager/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from '@/components/common/PageHeader.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import AddMemberDialog from './AddMemberDialog.vue';
import { queuesService } from '@/services';
import { errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';

const props = defineProps<{ name: string }>();
const auth = useAuthStore();
const realtime = useRealtimeStore();
const queryClient = useQueryClient();
const canWrite = computed(() => auth.hasPermission('queues:write'));

const queue = useQuery({ queryKey: computed(() => ['queues', props.name]), queryFn: () => queuesService.get(props.name) });
const members = useQuery({ queryKey: computed(() => ['queues', props.name, 'members']), queryFn: () => queuesService.members(props.name) });

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['queues'] });
}

const addOpen = ref(false);
const removeTarget = ref<QueueMember | null>(null);
const removeOpen = ref(false);

const update = useMutation({
  mutationFn: ({ m, data }: { m: QueueMember; data: { paused?: boolean; penalty?: number } }) => queuesService.updateMember(props.name, m.uniqueid, data),
  onSuccess: invalidate,
  onError: (e) => toast.error('No se pudo actualizar el miembro', { description: errorMessage(e) }),
});
const remove = useMutation({
  mutationFn: (m: QueueMember) => queuesService.removeMember(props.name, m.uniqueid),
  onSuccess: () => {
    toast.success('Miembro quitado de la cola');
    removeOpen.value = false;
    invalidate();
  },
  onError: (e) => toast.error('No se pudo quitar', { description: errorMessage(e) }),
});

function liveStatus(m: QueueMember) {
  if (!m.extensionId) return undefined;
  return realtime.endpointStatus(m.extensionId);
}

function onPenalty(m: QueueMember, v: string | number) {
  const n = Number(v);
  if (!Number.isNaN(n) && n !== m.penalty) update.mutate({ m, data: { penalty: n } });
}

const summary = computed(() => {
  const q = queue.data.value;
  if (!q) return [];
  return [
    ['Estrategia', q.strategy],
    ['Timeout', `${q.timeout} s`],
    ['Reintento', `${q.retry} s`],
    ['Wrap-up', `${q.wrapuptime} s`],
    ['Máx. espera', q.maxlen === 0 ? 'Sin límite' : String(q.maxlen)],
    ['Música', q.musiconhold],
    ['Timbrar en uso', q.ringinuse ? 'Sí' : 'No'],
    ['Autopausa', q.autopause],
  ];
});
</script>

<template>
  <PageHeader :title="`Cola ${name}`" :description="queue.data.value?.description ?? 'Miembros y parámetros de la cola.'">
    <Button variant="outline" as-child><RouterLink to="/queues"><ArrowLeftIcon /> Volver</RouterLink></Button>
    <Button v-if="canWrite" variant="outline" as-child><RouterLink :to="`/queues/${name}/edit`"><PencilIcon /> Editar cola</RouterLink></Button>
    <Button v-if="canWrite" @click="addOpen = true"><UserPlusIcon /> Agregar extensión</Button>
  </PageHeader>

  <div class="grid gap-6 lg:grid-cols-[1fr_280px]">
    <Card class="overflow-hidden">
      <CardHeader>
        <CardTitle>Miembros</CardTitle>
        <CardDescription>Extensiones PJSIP que atienden esta cola.</CardDescription>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Extensión</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead class="w-28">Penalty</TableHead>
              <TableHead>Pausa</TableHead>
              <TableHead class="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="members.isPending.value"><TableCell colspan="5"><Skeleton class="h-5 w-full" /></TableCell></TableRow>
            <TableRow v-else-if="!members.data.value?.length">
              <TableCell colspan="5" class="p-0">
                <EmptyState title="Sin miembros" description="Agrega extensiones activas para que reciban llamadas de la cola.">
                  <Button v-if="canWrite" size="sm" @click="addOpen = true"><UserPlusIcon /> Agregar extensión</Button>
                </EmptyState>
              </TableCell>
            </TableRow>
            <TableRow v-for="m in members.data.value" :key="m.uniqueid">
              <TableCell>
                <p class="font-mono font-medium">{{ m.extensionId ?? m.interface }}</p>
                <p class="text-xs text-muted-foreground">{{ m.extensionDisplayName ?? m.memberName ?? m.interface }}</p>
              </TableCell>
              <TableCell>
                <StatusBadge v-if="liveStatus(m)" :online="liveStatus(m)!.online" :device-state="liveStatus(m)!.deviceState" />
                <Badge v-else variant="outline">{{ m.status ?? 'Sin datos' }}</Badge>
              </TableCell>
              <TableCell>
                <Input type="number" min="0" max="100" class="h-7 w-20" :model-value="m.penalty" :disabled="!canWrite" @change="(e: Event) => onPenalty(m, (e.target as HTMLInputElement).value)" />
              </TableCell>
              <TableCell>
                <Badge :variant="m.paused ? 'secondary' : 'outline'">{{ m.paused ? 'En pausa' : 'Activo' }}</Badge>
              </TableCell>
              <TableCell>
                <div v-if="canWrite" class="flex justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" :aria-label="m.paused ? 'Reanudar' : 'Pausar'" @click="update.mutate({ m, data: { paused: !m.paused } })">
                    <PlayIcon v-if="m.paused" /><PauseIcon v-else />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Quitar" @click="removeTarget = m; removeOpen = true"><Trash2Icon class="text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Parámetros</CardTitle></CardHeader>
      <CardContent>
        <Skeleton v-if="queue.isPending.value" class="h-40 w-full" />
        <dl v-else class="space-y-2 text-sm">
          <div v-for="[k, v] in summary" :key="k" class="flex justify-between gap-2">
            <dt class="text-muted-foreground">{{ k }}</dt>
            <dd class="font-medium">{{ v }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  </div>

  <AddMemberDialog v-model:open="addOpen" :queue="name" @added="invalidate" />
  <ConfirmDialog
    v-model:open="removeOpen"
    :title="`¿Quitar ${removeTarget?.extensionId ?? removeTarget?.interface} de la cola?`"
    description="La extensión dejará de recibir llamadas de esta cola. Puedes volver a agregarla después."
    confirm-label="Quitar"
    destructive
    :loading="remove.isPending.value"
    @confirm="removeTarget && remove.mutate(removeTarget)"
  />
</template>
