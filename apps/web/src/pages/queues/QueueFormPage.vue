<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, SaveIcon } from '@lucide/vue';
import { QUEUE_COLUMNS, QUEUE_STRATEGIES, QueueCreateInput, QueueUpdateInput, type Queue, type QueueCreateForm } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/common/PageHeader.vue';
import { FormKeyValue, FormNumber, FormSelect, FormSwitch, FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { stripNulls } from '@/lib/format';
import { queuesService } from '@/services';

const props = defineProps<{ name?: string }>();
const router = useRouter();
const queryClient = useQueryClient();
const isEdit = computed(() => !!props.name);

const defaults: QueueCreateForm = {
  name: '',
  strategy: 'ringall',
  musiconhold: 'default',
  timeout: 15,
  retry: 5,
  wrapuptime: 0,
  maxlen: 0,
  servicelevel: 60,
  weight: 0,
  announceFrequency: 0,
  announceHoldtime: 'no',
  announcePosition: 'no',
  periodicAnnounceFrequency: 0,
  joinempty: 'yes',
  leavewhenempty: 'no',
  ringinuse: false,
  autopause: 'no',
  reportholdtime: 'no',
  timeoutrestart: 'no',
  advanced: {},
};

const form = useForm({
  validationSchema: toTypedSchema(isEdit.value ? QueueUpdateInput : QueueCreateInput),
  initialValues: defaults,
});

const existing = useQuery({
  queryKey: computed(() => ['queues', props.name]),
  queryFn: () => queuesService.get(props.name!),
  enabled: isEdit,
});
watch(
  () => existing.data.value,
  (q) => {
    if (!q) return;
    const { members: _m, membersCount: _c, createdAt: _a, updatedAt: _u, ...rest } = q;
    form.resetForm({ values: stripNulls(rest) as QueueCreateForm });
  },
  { immediate: true },
);

const save = useMutation({
  mutationFn: (values: QueueCreateForm) => {
    if (isEdit.value) {
      const { name: _n, ...rest } = values;
      return queuesService.update(props.name!, rest as QueueUpdateInput);
    }
    return queuesService.create(values);
  },
  onSuccess: (q: Queue) => {
    toast.success(isEdit.value ? `Cola ${q.name} actualizada` : `Cola ${q.name} creada`);
    queryClient.invalidateQueries({ queryKey: ['queues'] });
    router.push(`/queues/${q.name}`);
  },
  onError: (e) => toast.error('No se pudo guardar', { description: errorMessage(e) }),
});
const submit = form.handleSubmit((values) => save.mutate(values as QueueCreateForm));

const strategyDescriptions: Record<string, string> = {
  ringall: 'Timbra a todos a la vez',
  leastrecent: 'Al que lleva más tiempo sin atender',
  fewestcalls: 'Al que menos llamadas ha atendido',
  random: 'Aleatorio',
  rrmemory: 'Round robin con memoria',
  linear: 'En el orden definido',
  wrandom: 'Aleatorio ponderado por penalty',
  rrordered: 'Round robin en orden',
};
const strategyOptions = QUEUE_STRATEGIES.map((s) => ({ value: s, label: s, description: strategyDescriptions[s] }));
const yesNo = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
const holdtimeOptions = [...yesNo, { value: 'once', label: 'Una vez' }];
const positionOptions = [...yesNo, { value: 'limit', label: 'Hasta un límite' }, { value: 'more', label: 'Más de' }];
const autopauseOptions = [...yesNo, { value: 'all', label: 'En todas las colas' }];
</script>

<template>
  <PageHeader :title="isEdit ? `Cola ${name}` : 'Nueva cola'" description="Parámetros de la cola (tabla queues).">
    <Button variant="outline" as-child><RouterLink :to="isEdit ? `/queues/${name}` : '/queues'"><ArrowLeftIcon /> Volver</RouterLink></Button>
    <Button :disabled="save.isPending.value" @click="submit"><SaveIcon /> Guardar</Button>
  </PageHeader>

  <div v-if="isEdit && existing.isPending.value" class="space-y-3"><Skeleton class="h-10 w-72" /><Skeleton class="h-72 w-full" /></div>

  <form v-else class="space-y-6" novalidate @submit="submit">
    <Tabs default-value="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="announce">Anuncios</TabsTrigger>
        <TabsTrigger value="advanced">Avanzado</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identidad</CardTitle></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="name" label="Nombre" placeholder="ventas" mono :disabled="isEdit" />
            <FormSelect name="strategy" label="Estrategia" :options="strategyOptions" />
            <div class="sm:col-span-2"><FormText name="description" label="Descripción" /></div>
            <FormText name="musiconhold" label="Música en espera" mono />
            <FormText name="context" label="Contexto de salida" mono hint="Permite salir de la cola marcando un dígito." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tiempos y límites</CardTitle></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormNumber name="timeout" label="Timeout por agente (s)" :min="0" :max="600" />
            <FormNumber name="retry" label="Reintento (s)" :min="0" :max="600" />
            <FormNumber name="wrapuptime" label="Wrap-up (s)" :min="0" :max="3600" hint="Descanso tras colgar." />
            <FormNumber name="maxlen" label="Máx. llamadas en espera" :min="0" :max="1000" hint="0 = sin límite." />
            <FormNumber name="servicelevel" label="Nivel de servicio (s)" :min="0" :max="3600" />
            <FormNumber name="weight" label="Peso" :min="0" :max="100" />
          </CardContent>
        </Card>
        <Card class="lg:col-span-2">
          <CardHeader><CardTitle>Comportamiento</CardTitle></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormText name="joinempty" label="Entrar si está vacía (joinempty)" mono hint="yes, no, strict, loose o lista de estados." />
            <FormText name="leavewhenempty" label="Salir si queda vacía (leavewhenempty)" mono />
            <FormSelect name="autopause" label="Autopausa" :options="autopauseOptions" hint="Pausa al agente que no contesta." />
            <FormSelect name="reportholdtime" label="Reportar tiempo en espera" :options="yesNo" />
            <FormSelect name="timeoutrestart" label="Reiniciar timeout al BUSY/CONGESTION" :options="yesNo" />
            <FormSwitch name="ringinuse" label="Timbrar a agentes en llamada" hint="ringinuse" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="announce" class="mt-4">
        <Card>
          <CardHeader><CardTitle>Anuncios al llamante</CardTitle><CardDescription>Frecuencia y tipo de mensajes de posición y espera.</CardDescription></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormNumber name="announceFrequency" label="Frecuencia de anuncio (s)" :min="0" :max="3600" hint="0 desactiva." />
            <FormNumber name="periodicAnnounceFrequency" label="Anuncio periódico (s)" :min="0" :max="3600" />
            <FormSelect name="announceHoldtime" label="Anunciar tiempo estimado" :options="holdtimeOptions" />
            <FormSelect name="announcePosition" label="Anunciar posición" :options="positionOptions" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="advanced" class="mt-4">
        <Card>
          <CardHeader><CardTitle>Opciones avanzadas</CardTitle><CardDescription>Cualquier columna de la tabla queues.</CardDescription></CardHeader>
          <CardContent><FormKeyValue name="advanced" title="queues" :columns="QUEUE_COLUMNS" /></CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" as-child><RouterLink to="/queues">Cancelar</RouterLink></Button>
      <Button type="submit" :disabled="save.isPending.value"><SaveIcon /> {{ isEdit ? 'Guardar cambios' : 'Crear cola' }}</Button>
    </div>
  </form>
</template>
