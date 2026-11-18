<script setup lang="ts">
import { computed, watch } from 'vue';
import { useForm } from 'vee-validate';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import { CreateUserInput, Role, UpdateUserInput, type UserPublic } from '@voip-manager/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormSelect, FormSwitch, FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { usersService } from '@/services';

const props = defineProps<{ user: UserPublic | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [] }>();
const isEdit = computed(() => !!props.user);

// En edición la contraseña es opcional (vacía = no cambiar).
const EditSchema = UpdateUserInput.extend({ password: z.string().min(8).max(128).optional() });
type FormValues = z.input<typeof CreateUserInput>;

const form = useForm({ validationSchema: toTypedSchema(isEdit.value ? EditSchema : CreateUserInput) });

watch(open, (v) => {
  if (!v) return;
  form.resetForm({
    values: props.user
      ? { username: props.user.username, fullName: props.user.fullName, email: props.user.email ?? undefined, role: props.user.role, active: props.user.active, password: '' }
      : { username: '', password: '', fullName: '', email: undefined, role: 'viewer', active: true },
  });
});

const save = useMutation({
  mutationFn: (values: FormValues) => {
    if (isEdit.value) {
      const { username: _u, password, ...rest } = values;
      return usersService.update(props.user!.id, { ...rest, ...(password ? { password } : {}) });
    }
    return usersService.create(values as CreateUserInput);
  },
  onSuccess: (u) => {
    toast.success(isEdit.value ? `Usuario ${u.username} actualizado` : `Usuario ${u.username} creado`);
    open.value = false;
    emit('saved');
  },
  onError: (e) => toast.error('No se pudo guardar', { description: errorMessage(e) }),
});
const submit = form.handleSubmit((values) => save.mutate(values as FormValues));

const roleOptions = Role.options.map((r) => ({
  value: r,
  label: { admin: 'Administrador', operator: 'Operador', viewer: 'Lectura' }[r],
  description: { admin: 'Acceso total, incluye usuarios', operator: 'Administra objetos y ejecuta AMI', viewer: 'Solo consulta' }[r],
}));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <form class="space-y-4" novalidate @submit="submit">
        <DialogHeader>
          <DialogTitle>{{ isEdit ? `Editar ${user?.username}` : 'Nuevo usuario' }}</DialogTitle>
          <DialogDescription>Las cuentas son locales; el rol determina los permisos sobre cada objeto.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormText name="username" label="Usuario" mono autocomplete="off" :disabled="isEdit" />
          <FormText name="password" :label="isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña'" type="password" autocomplete="new-password" />
          <FormText name="fullName" label="Nombre completo" />
          <FormText name="email" label="Correo (opcional)" type="email" />
          <FormSelect name="role" label="Rol" :options="roleOptions" />
          <div class="pt-5"><FormSwitch name="active" label="Activo" /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cancelar</Button>
          <Button type="submit" :disabled="save.isPending.value">Guardar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
