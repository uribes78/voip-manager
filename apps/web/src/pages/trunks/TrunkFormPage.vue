<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, SaveIcon } from '@lucide/vue';
import {
  CODECS,
  PS_AOR_COLUMNS,
  PS_AUTH_COLUMNS,
  PS_ENDPOINT_COLUMNS,
  PS_IDENTIFY_COLUMNS,
  PS_REGISTRATION_COLUMNS,
  TrunkCreateInput,
  TrunkUpdateInput,
  type Trunk,
  type TrunkCreateForm,
} from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/common/PageHeader.vue';
import { FormKeyValue, FormMultiCheck, FormNumber, FormSelect, FormSwitch, FormText } from '@/components/common/form';
import MatchAddressesField from './MatchAddressesField.vue';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { stripNulls } from '@/lib/format';
import { trunksService } from '@/services';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const queryClient = useQueryClient();
const auth = useAuthStore();
const isEdit = computed(() => !!props.id);
const readOnly = computed(() => !auth.hasPermission('trunks:write'));

const defaults: TrunkCreateForm = {
  id: '',
  mode: 'credentials',
  host: '',
  port: 5060,
  transport: 'transport-udp',
  context: 'from-trunk',
  codecs: ['ulaw', 'alaw'],
  matchAddresses: [],
  register: true,
  qualifyFrequency: 60,
  directMedia: false,
  advanced: { endpoint: {}, aor: {}, auth: {}, registration: {}, identify: {} },
};

const form = useForm({
  validationSchema: toTypedSchema(isEdit.value ? TrunkUpdateInput : TrunkCreateInput),
  initialValues: defaults,
});
const mode = computed(() => form.values.mode);

const existing = useQuery({
  queryKey: computed(() => ['trunks', props.id]),
  queryFn: () => trunksService.get(props.id!),
  enabled: isEdit,
});
watch(
  () => existing.data.value,
  (t) => {
    if (!t) return;
    const { type: _t, createdAt: _c, updatedAt: _u, deletedAt: _d, createdBy: _b, online: _o, registrationStatus: _r, ...rest } = t;
    form.resetForm({ values: stripNulls(rest) as TrunkCreateForm });
  },
  { immediate: true },
);

const save = useMutation({
  mutationFn: (values: TrunkCreateForm) => {
    if (isEdit.value) {
      const { id: _id, ...rest } = values;
      return trunksService.update(props.id!, rest as TrunkUpdateInput);
    }
    return trunksService.create(values);
  },
  onSuccess: (t: Trunk) => {
    toast.success(isEdit.value ? `Troncal ${t.id} actualizada` : `Troncal ${t.id} creada`);
    queryClient.invalidateQueries({ queryKey: ['trunks'] });
    router.push('/trunks');
  },
  onError: (e) => toast.error('No se pudo guardar', { description: errorMessage(e) }),
});
const submit = form.handleSubmit((values) => save.mutate(values as TrunkCreateForm));

const modeOptions = [
  { value: 'ip', label: 'Por IP', description: 'Sin registro; se identifica por dirección' },
  { value: 'credentials', label: 'Usuario y contraseña', description: 'Con registro opcional al carrier' },
];
</script>

<template>
  <PageHeader :title="isEdit ? `Troncal ${id}` : 'Nueva troncal'" description="Troncal PJSIP hacia un carrier u otra central.">
    <Button variant="outline" as-child><RouterLink to="/trunks"><ArrowLeftIcon /> Volver</RouterLink></Button>
    <Button v-if="!readOnly" :disabled="save.isPending.value" @click="submit"><SaveIcon /> Guardar</Button>
  </PageHeader>

  <div v-if="isEdit && existing.isPending.value" class="space-y-3"><Skeleton class="h-10 w-72" /><Skeleton class="h-72 w-full" /></div>

  <form v-else class="space-y-6" novalidate @submit="submit">
    <Tabs default-value="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="advanced">Avanzado</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identidad y destino</CardTitle><CardDescription>Nombre interno y servidor remoto.</CardDescription></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="id" label="Nombre de la troncal" placeholder="carrier-principal" mono :disabled="isEdit || readOnly" />
            <FormSelect name="mode" label="Modo" :options="modeOptions" :disabled="readOnly" />
            <FormText name="host" label="Host / IP del carrier" placeholder="sip.carrier.com" mono :disabled="readOnly" />
            <FormNumber name="port" label="Puerto" :min="1" :max="65535" :disabled="readOnly" />
            <div class="sm:col-span-2"><FormText name="description" label="Descripción" :disabled="readOnly" /></div>
          </CardContent>
        </Card>

        <Card v-if="mode === 'credentials'">
          <CardHeader><CardTitle>Credenciales</CardTitle><CardDescription>Autenticación saliente y registro con el carrier.</CardDescription></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="username" label="Usuario" mono :disabled="readOnly" />
            <FormText name="secret" label="Contraseña" type="password" mono :disabled="readOnly" />
            <FormText name="authUsername" label="Auth username (opcional)" mono hint="Si el carrier usa un usuario distinto para autenticar." :disabled="readOnly" />
            <FormText name="callerId" label="Caller ID (opcional)" placeholder="Empresa <5551234567>" :disabled="readOnly" />
            <FormText name="fromUser" label="From user (opcional)" mono :disabled="readOnly" />
            <FormText name="fromDomain" label="From domain (opcional)" mono :disabled="readOnly" />
            <div class="sm:col-span-2">
              <FormSwitch name="register" label="Registrarse con el carrier" hint="Crea la fila en ps_registrations para registro saliente." :disabled="readOnly" />
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardHeader><CardTitle>Identificación por IP</CardTitle><CardDescription>Direcciones desde las que el remoto enviará llamadas.</CardDescription></CardHeader>
          <CardContent class="space-y-4">
            <MatchAddressesField name="matchAddresses" :disabled="readOnly" />
            <FormText name="callerId" label="Caller ID (opcional)" placeholder="Empresa <5551234567>" :disabled="readOnly" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Medios y marcación</CardTitle><CardDescription>Contexto de entrada, transporte y codecs.</CardDescription></CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="context" label="Contexto de entrada" mono hint="Dónde caen las llamadas entrantes por esta troncal." :disabled="readOnly" />
            <FormText name="transport" label="Transporte" mono :disabled="readOnly" />
            <div class="sm:col-span-2"><FormMultiCheck name="codecs" label="Codecs" :options="CODECS" :disabled="readOnly" /></div>
            <FormNumber name="qualifyFrequency" label="Qualify (s)" :min="0" :max="300" :disabled="readOnly" />
            <div class="sm:col-span-2"><FormSwitch name="directMedia" label="Direct media" :disabled="readOnly" /></div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="advanced" class="mt-4">
        <Card>
          <CardHeader><CardTitle>Opciones avanzadas</CardTitle><CardDescription>Columnas adicionales por tabla realtime.</CardDescription></CardHeader>
          <CardContent class="space-y-8">
            <FormKeyValue name="advanced.endpoint" title="ps_endpoints" :columns="PS_ENDPOINT_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.aor" title="ps_aors" :columns="PS_AOR_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.auth" title="ps_auths" :columns="PS_AUTH_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.registration" title="ps_registrations" :columns="PS_REGISTRATION_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.identify" title="ps_endpoint_id_ips" :columns="PS_IDENTIFY_COLUMNS" :disabled="readOnly" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <div v-if="!readOnly" class="flex justify-end gap-2">
      <Button type="button" variant="outline" as-child><RouterLink to="/trunks">Cancelar</RouterLink></Button>
      <Button type="submit" :disabled="save.isPending.value"><SaveIcon /> {{ isEdit ? 'Guardar cambios' : 'Crear troncal' }}</Button>
    </div>
  </form>
</template>
