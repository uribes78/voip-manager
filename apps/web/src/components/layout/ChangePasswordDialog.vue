<script setup lang="ts">
import { useForm } from 'vee-validate';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { ChangePasswordInput } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { api, errorMessage } from '@/lib/api';

const open = defineModel<boolean>('open', { default: false });

const form = useForm({ validationSchema: toTypedSchema(ChangePasswordInput) });

const mutation = useMutation({
  mutationFn: (values: ChangePasswordInput) => api.post('/auth/change-password', values),
  onSuccess: () => {
    toast.success('Contraseña actualizada');
    form.resetForm();
    open.value = false;
  },
  onError: (e) => toast.error('No se pudo cambiar la contraseña', { description: errorMessage(e) }),
});

const submit = form.handleSubmit((values) => mutation.mutate(values));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <form class="space-y-4" @submit="submit">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>La nueva contraseña debe tener al menos 8 caracteres.</DialogDescription>
        </DialogHeader>
        <FormText name="currentPassword" label="Contraseña actual" type="password" autocomplete="current-password" />
        <FormText name="newPassword" label="Nueva contraseña" type="password" autocomplete="new-password" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancelar</Button>
          <Button type="submit" :disabled="mutation.isPending.value">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
