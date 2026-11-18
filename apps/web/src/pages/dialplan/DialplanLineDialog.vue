<script setup lang="ts">
import { computed, watch } from 'vue';
import { useForm } from 'vee-validate';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { DialplanLineInput, type DialplanLine } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormNumber, FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { dialplanService } from '@/services';

const props = defineProps<{ context: string; line: DialplanLine | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [] }>();

const isEdit = computed(() => !!props.line && props.line.id > 0);
const form = useForm({ validationSchema: toTypedSchema(DialplanLineInput) });

watch(open, (v) => {
  if (!v) return;
  form.resetForm({
    values: props.line
      ? { context: props.line.context, exten: props.line.exten, priority: props.line.priority, app: props.line.app, appdata: props.line.appdata }
      : { context: props.context, exten: '', priority: 1, app: '', appdata: '' },
  });
});

const save = useMutation({
  mutationFn: (values: DialplanLineInput) =>
    isEdit.value ? dialplanService.updateLine(props.line!.id, values) : dialplanService.createLine(values),
  onSuccess: () => {
    toast.success(isEdit.value ? 'Línea actualizada' : 'Línea agregada');
    open.value = false;
    emit('saved');
  },
  onError: (e) => toast.error('No se pudo guardar', { description: errorMessage(e) }),
});
const submit = form.handleSubmit((values) => save.mutate(values));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <form class="space-y-4" novalidate @submit="submit">
        <DialogHeader>
          <DialogTitle>{{ isEdit ? 'Editar línea' : 'Nueva línea' }}</DialogTitle>
          <DialogDescription>Equivale a <code>exten => exten,prioridad,App(args)</code>.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 sm:grid-cols-[1fr_1fr_100px]">
          <FormText name="context" label="Contexto" mono :disabled="!!context" />
          <FormText name="exten" label="Exten / patrón" placeholder="_1XXX" mono />
          <FormNumber name="priority" label="Prioridad" :min="1" :max="9999" />
          <FormText name="app" label="Aplicación" placeholder="Dial" mono />
          <div class="sm:col-span-2"><FormText name="appdata" label="Argumentos" placeholder="PJSIP/${EXTEN},30,tT" mono /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancelar</Button>
          <Button type="submit" :disabled="save.isPending.value">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
