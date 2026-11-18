<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { DicesIcon } from '@lucide/vue';
import { ExtensionCloneInput, type ExtensionSummary } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { randomSecret } from '@/lib/format';
import { extensionsService } from '@/services';

const props = defineProps<{ source: ExtensionSummary | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ cloned: [] }>();
const router = useRouter();

const form = useForm({ validationSchema: toTypedSchema(ExtensionCloneInput) });

watch(open, (v) => {
  if (v) form.resetForm({ values: { newId: '', displayName: props.source?.displayName ?? '', secret: undefined } });
});

const mutation = useMutation({
  mutationFn: (values: ExtensionCloneInput) => extensionsService.clone(props.source!.id, values),
  onSuccess: (ext) => {
    toast.success(`Extensión ${ext.id} creada a partir de ${props.source?.id}`, {
      action: { label: 'Editar', onClick: () => router.push(`/extensions/${ext.id}/edit`) },
    });
    open.value = false;
    emit('cloned');
  },
  onError: (e) => toast.error('No se pudo clonar', { description: errorMessage(e) }),
});

const submit = form.handleSubmit((values) => mutation.mutate(values));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <form class="space-y-4" novalidate @submit="submit">
        <DialogHeader>
          <DialogTitle>Clonar extensión {{ source?.id }}</DialogTitle>
          <DialogDescription>Se copian todas las opciones (incluido lo avanzado) con un nuevo número y contraseña.</DialogDescription>
        </DialogHeader>
        <FormText name="newId" label="Nueva extensión" placeholder="1002" mono />
        <FormText name="displayName" label="Nombre a mostrar" />
        <FormText name="secret" label="Contraseña SIP" hint="Déjala vacía para generar una aleatoria." mono>
          <template #after>
            <Button type="button" variant="link" size="xs" class="px-0" @click="form.setFieldValue('secret', randomSecret())">
              <DicesIcon /> Generar
            </Button>
          </template>
        </FormText>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancelar</Button>
          <Button type="submit" :disabled="mutation.isPending.value">Clonar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
