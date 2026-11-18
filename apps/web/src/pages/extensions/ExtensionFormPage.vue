<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { ArrowLeftIcon, DicesIcon, SaveIcon } from '@lucide/vue';
import {
  CODECS,
  DTMF_MODES,
  ExtensionCreateInput,
  ExtensionUpdateInput,
  PS_AOR_COLUMNS,
  PS_AUTH_COLUMNS,
  PS_ENDPOINT_COLUMNS,
  type Extension,
  type ExtensionCreateForm,
} from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/common/PageHeader.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { FormKeyValue, FormMultiCheck, FormNumber, FormSelect, FormSwitch, FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { randomSecret, stripNulls } from '@/lib/format';
import { extensionsService } from '@/services';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const queryClient = useQueryClient();
const auth = useAuthStore();
const realtime = useRealtimeStore();

const isEdit = computed(() => !!props.id);
const readOnly = computed(() => !auth.hasPermission('extensions:write'));

const defaults: ExtensionCreateForm = {
  id: '',
  displayName: '',
  secret: randomSecret(),
  context: 'from-internal',
  transport: 'transport-udp',
  codecs: ['ulaw', 'alaw', 'g722'],
  dtmfMode: 'rfc4733',
  maxContacts: 1,
  removeExisting: true,
  qualifyFrequency: 60,
  directMedia: false,
  nat: true,
  webrtc: false,
  advanced: { endpoint: {}, aor: {}, auth: {} },
};

const form = useForm({
  validationSchema: toTypedSchema(isEdit.value ? ExtensionUpdateInput : ExtensionCreateInput),
  initialValues: defaults,
});

const existing = useQuery({
  queryKey: computed(() => ['extensions', props.id]),
  queryFn: () => extensionsService.get(props.id!),
  enabled: isEdit,
});

watch(
  () => existing.data.value,
  (ext) => {
    if (!ext) return;
    const { type: _t, createdAt: _c, updatedAt: _u, deletedAt: _d, createdBy: _b, online: _o, deviceState: _s, contacts: _k, ...rest } = ext;
    form.resetForm({ values: stripNulls(rest) as ExtensionCreateForm });
  },
  { immediate: true },
);

const live = computed(() => (props.id ? realtime.endpointStatus(props.id) : undefined));

const save = useMutation({
  mutationFn: (values: ExtensionCreateForm) => {
    if (isEdit.value) {
      const { id: _id, ...rest } = values;
      return extensionsService.update(props.id!, rest as ExtensionUpdateInput);
    }
    return extensionsService.create(values);
  },
  onSuccess: (ext: Extension) => {
    toast.success(isEdit.value ? `Extensión ${ext.id} actualizada` : `Extensión ${ext.id} creada`);
    queryClient.invalidateQueries({ queryKey: ['extensions'] });
    router.push('/extensions');
  },
  onError: (e) => toast.error('No se pudo guardar', { description: errorMessage(e) }),
});

const submit = form.handleSubmit((values) => save.mutate(values as ExtensionCreateForm));

const dtmfOptions = DTMF_MODES.map((m) => ({ value: m, label: m }));
</script>

<template>
  <PageHeader
    :title="isEdit ? `Extensión ${id}` : 'Nueva extensión'"
    :description="isEdit ? 'Modifica el endpoint, AOR y credenciales de la extensión.' : 'Crea el endpoint PJSIP con su AOR y autenticación.'"
  >
    <StatusBadge v-if="isEdit && live" :online="live.online" :device-state="live.deviceState" />
    <Button variant="outline" as-child><RouterLink to="/extensions"><ArrowLeftIcon /> Volver</RouterLink></Button>
    <Button v-if="!readOnly" :disabled="save.isPending.value" @click="submit"><SaveIcon /> Guardar</Button>
  </PageHeader>

  <div v-if="isEdit && existing.isPending.value" class="space-y-3">
    <Skeleton class="h-10 w-72" />
    <Skeleton class="h-72 w-full" />
  </div>

  <form v-else class="space-y-6" novalidate @submit="submit">
    <Tabs default-value="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="advanced">Avanzado</TabsTrigger>
      </TabsList>

      <TabsContent value="general" class="mt-4 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identidad</CardTitle>
            <CardDescription>Número, nombre y credenciales SIP.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="id" label="Extensión" placeholder="1001" mono :disabled="isEdit || readOnly" hint="Se usa como id de endpoint, AOR y auth." />
            <FormText name="displayName" label="Nombre a mostrar" placeholder="Recepción" :disabled="readOnly" />
            <FormText name="secret" label="Contraseña SIP" mono :disabled="readOnly">
              <template #after>
                <Button v-if="!readOnly" type="button" variant="link" size="xs" class="px-0" @click="form.setFieldValue('secret', randomSecret())"><DicesIcon /> Generar</Button>
              </template>
            </FormText>
            <FormText name="authUsername" label="Usuario de autenticación" placeholder="(igual a la extensión)" mono :disabled="readOnly" />
            <div class="sm:col-span-2">
              <FormText name="description" label="Descripción" placeholder="Ubicación, responsable…" :disabled="readOnly" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marcación y medios</CardTitle>
            <CardDescription>Contexto de salida, transporte y codecs.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormText name="context" label="Contexto" mono :disabled="readOnly" />
            <FormText name="transport" label="Transporte" mono hint="Debe existir en pjsip.conf o ps_transports." :disabled="readOnly" />
            <div class="sm:col-span-2">
              <FormMultiCheck name="codecs" label="Codecs permitidos" :options="CODECS" hint="El orden de la lista define la preferencia." :disabled="readOnly" />
            </div>
            <FormSelect name="dtmfMode" label="Modo DTMF" :options="dtmfOptions" :disabled="readOnly" />
            <FormText name="language" label="Idioma" placeholder="es" :disabled="readOnly" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registro (AOR)</CardTitle>
            <CardDescription>Contactos simultáneos y monitoreo con qualify.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <FormNumber name="maxContacts" label="Máx. contactos" :min="1" :max="10" :disabled="readOnly" />
            <FormNumber name="qualifyFrequency" label="Qualify (s)" :min="0" :max="300" hint="0 desactiva el monitoreo." :disabled="readOnly" />
            <div class="sm:col-span-2">
              <FormSwitch name="removeExisting" label="Reemplazar contacto existente" hint="Al registrarse un nuevo dispositivo se elimina el anterior (remove_existing)." :disabled="readOnly" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Red y funciones</CardTitle>
            <CardDescription>NAT, medios directos, buzón y grupos.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-3 sm:col-span-2">
              <FormSwitch name="nat" label="Detrás de NAT" hint="Activa rtp_symmetric, force_rport y rewrite_contact." :disabled="readOnly" />
              <FormSwitch name="directMedia" label="Direct media" hint="Permite RTP directo entre teléfonos (direct_media)." :disabled="readOnly" />
              <FormSwitch name="webrtc" label="WebRTC" hint="Configura DTLS/ICE/AVPF para clientes web." :disabled="readOnly" />
            </div>
            <FormText name="mailbox" label="Buzón de voz" placeholder="1001@default" mono :disabled="readOnly" />
            <div />
            <FormText name="callGroup" label="Call group" placeholder="1" :disabled="readOnly" />
            <FormText name="pickupGroup" label="Pickup group" placeholder="1" :disabled="readOnly" />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="advanced" class="mt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Opciones avanzadas</CardTitle>
            <CardDescription>
              Columnas adicionales de las tablas realtime. Se escriben tal cual; tienen prioridad sobre lo configurado en la pestaña General.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-8">
            <FormKeyValue name="advanced.endpoint" title="ps_endpoints" description="Opciones del endpoint (p.ej. callerid_privacy, tos_audio, set_var)." :columns="PS_ENDPOINT_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.aor" title="ps_aors" description="Opciones del AOR (p.ej. default_expiration, qualify_timeout)." :columns="PS_AOR_COLUMNS" :disabled="readOnly" />
            <FormKeyValue name="advanced.auth" title="ps_auths" description="Opciones de autenticación (p.ej. realm, nonce_lifetime)." :columns="PS_AUTH_COLUMNS" :disabled="readOnly" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <div v-if="!readOnly" class="flex justify-end gap-2">
      <Button type="button" variant="outline" as-child><RouterLink to="/extensions">Cancelar</RouterLink></Button>
      <Button type="submit" :disabled="save.isPending.value"><SaveIcon /> {{ isEdit ? 'Guardar cambios' : 'Crear extensión' }}</Button>
    </div>
  </form>
</template>
