<script setup lang="ts">
import { useField } from 'vee-validate';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FieldError from './FieldError.vue';

const props = defineProps<{
  name: string;
  label: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}>();

const { value, errorMessage, handleBlur } = useField<number | undefined>(() => props.name);

function onInput(v: string | number) {
  if (v === '' || v === null || v === undefined) {
    value.value = undefined;
    return;
  }
  const n = Number(v);
  value.value = Number.isNaN(n) ? undefined : n;
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="name">{{ label }}</Label>
    <Input
      :id="name"
      type="number"
      inputmode="numeric"
      :model-value="value ?? ''"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :disabled="disabled"
      :aria-invalid="!!errorMessage"
      @update:model-value="onInput"
      @blur="handleBlur"
    />
    <p v-if="hint && !errorMessage" class="text-xs text-muted-foreground">{{ hint }}</p>
    <FieldError :message="errorMessage" />
  </div>
</template>
