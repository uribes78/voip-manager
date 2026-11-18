<script setup lang="ts">
import { computed, watch } from 'vue';
import { useForm } from 'vee-validate';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { LoaderCircleIcon } from '@lucide/vue';
import { MohClassCreateInput, type MohClass, type MohClassForm, type MohEnvironment } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormSelect, FormSwitch, FormText, FormTextarea } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { mohService } from '@/services';

const props = defineProps<{ editing?: MohClass | null; environment?: MohEnvironment }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [cls: MohClass] }>();
const qc = useQueryClient();

const schema = MohClassCreateInput.extend({ entriesText: MohClassCreateInput.shape.entries.optional().or(MohClassCreateInput.shape.application) });
const form = useForm<MohClassForm & { entriesText?: string }>({ validationSchema: toTypedSchema(schema as never) });
const mode = computed(() => form.values.mode ?? 'files');
const isEdit = computed(() => !!props.editing);

watch(
  () => [open.value, props.editing] as const,
  ([isOpen]) => {
    if (!isOpen) return;
    const e = props.editing;
    form.resetForm({
      values: e
        ? { name: e.name, mode: e.mode, directory: e.directory, sort: e.sort, digit: e.digit ?? '', application: e.application ?? '', format: e.format ?? '', loopLast: e.loopLast, entries: e.entries, entriesText: e.entries.join('\n') }
        : { name: '', mode: 'files', directory: '', sort: 'alpha', digit: '', application: '', format: '', loopLast: false, entries: [], entriesText: '' },
    });
  },
  { immediate: true },
);

// Sugerir directorio moh/<nombre> mientras no se haya escrito uno a mano.
watch(
  () => form.values.name,
  (name, prev) => {
    if (isEdit.value) return;
    const current = form.values.directory ?? '';
    if (!current || current === `moh/${prev ?? ''}`) form.setFieldValue('directory', name ? `moh/${name}` : '');
  },
);

const save = useMutation({
  mutationFn: (values: MohClassForm & { entriesText?: string }) => {
    const { entriesText, ...rest } = values;
    const payload = {
      ...rest,
      digit: rest.digit || undefined,
      application: rest.application || undefined,
      format: rest.format || undefined,
      entries: rest.mode === 'playlist' ? (entriesText ?? '').split('\n').map((s) => s.trim()).filter(Boolean) : [],
    };
    if (props.editing) {
      const { name, ...patch } = payload;
      return mohService.update(props.editing.name, patch);
    }
    return mohService.create(MohClassCreateInput.parse(payload));
  },
  onSuccess: (cls) => {
    qc.invalidateQueries({ queryKey: ['moh'] });
    toast.success(isEdit.value ? `Clase ${cls.name} actualizada` : `Clase ${cls.name} creada`, {
      description: cls.loaded ? 'Asterisk ya la tiene cargada.' : 'Asterisk la cargará la primera vez que se use.',
    });
    emit('saved', cls);
    open.value = false;
  },
  onError: (e) => toast.error('No se pudo guardar la clase', { description: errorMessage(e) }),
});
const saving = computed(() => save.isPending.value);
const submit = form.handleSubmit((v) => save.mutate(v));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? `Editar clase ${editing?.name}` : 'Nueva clase de música en espera' }}</DialogTitle>
        <DialogDescription>Se guarda en la tabla realtime <code>musiconhold</code>. Las extensiones y colas la usan por nombre.</DialogDescription>
      </DialogHeader>
      <form id="moh-class-form" class="space-y-4" novalidate @submit="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <FormText name="name" label="Nombre" placeholder="ventas" :disabled="isEdit" hint="Letras, números, guion y guion bajo" />
          <FormSelect name="mode" label="Modo" :options="[{ value: 'files', label: 'files · archivos en un directorio' }, { value: 'playlist', label: 'playlist · lista de URLs/rutas' }, { value: 'custom', label: 'custom · comando externo' }]" />
        </div>
        <FormText
          v-if="mode !== 'playlist'"
          name="directory"
          label="Directorio"
          placeholder="moh/ventas"
          :hint="`Relativo a ${environment?.dataRemotePath ?? '/var/lib/asterisk'} en el servidor Asterisk, o absoluto. Para subir audios desde aquí debe estar mapeado localmente.`"
        />
        <FormTextarea v-if="mode === 'playlist'" name="entriesText" label="Entradas (una por línea)" placeholder="http://servidor/stream.mp3&#10;/var/lib/asterisk/moh/pista.wav" />
        <template v-if="mode === 'custom'">
          <FormText name="application" label="Comando" placeholder="/usr/bin/mpg123 -q -r 8000 -f 8192 -b 2048 --mono -s" />
          <FormText name="format" label="Formato que entrega" placeholder="slin" />
        </template>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormSelect name="sort" label="Orden de reproducción" :options="[{ value: 'alpha', label: 'alpha · alfabético' }, { value: 'random', label: 'random · aleatorio' }, { value: 'randstart', label: 'randstart · inicio aleatorio' }]" />
          <FormText name="digit" label="Dígito de selección" placeholder="opcional" hint="Permite cambiar de clase marcando este dígito" />
        </div>
        <FormSwitch name="loopLast" label="Repetir solo la última pista" description="loop_last: tras la primera vuelta repite el último archivo." />
      </form>
      <DialogFooter>
        <Button variant="outline" type="button" @click="open = false">Cancelar</Button>
        <Button type="submit" form="moh-class-form" :disabled="saving">
          <LoaderCircleIcon v-if="saving" class="animate-spin" />
          {{ isEdit ? 'Guardar' : 'Crear clase' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
