<script setup lang="ts">
import { useField } from 'vee-validate';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import FieldError from './FieldError.vue';

const props = defineProps<{ name: string; label: string; hint?: string; disabled?: boolean }>();
const { value, errorMessage } = useField<boolean | undefined>(() => props.name);
</script>

<template>
  <div class="flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5">
    <div class="space-y-0.5">
      <Label :for="name" class="cursor-pointer">{{ label }}</Label>
      <p v-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
      <FieldError :message="errorMessage" />
    </div>
    <Switch :id="name" :model-value="!!value" :disabled="disabled" @update:model-value="(v: boolean) => (value = v)" />
  </div>
</template>
