<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    loading?: boolean;
  }>(),
  { confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', destructive: false, loading: false },
);

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="description">{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <slot />
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="loading">{{ cancelLabel }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="loading"
          :class="destructive ? buttonVariants({ variant: 'destructive' }) : undefined"
          @click.prevent="emit('confirm')"
        >
          {{ loading ? 'Procesando…' : confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
