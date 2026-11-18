<script setup lang="ts">
import { useField } from 'vee-validate';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import FieldError from './FieldError.vue';

const props = defineProps<{ name: string; label: string; placeholder?: string; hint?: string; rows?: number; disabled?: boolean }>();
const { value, errorMessage, handleBlur } = useField<string | undefined>(() => props.name);

function onInput(v: string | number) {
  const s = String(v);
  value.value = s === '' ? undefined : s;
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="name">{{ label }}</Label>
    <Textarea
      :id="name"
      :model-value="value ?? ''"
      :placeholder="placeholder"
      :rows="rows ?? 3"
      :disabled="disabled"
      :aria-invalid="!!errorMessage"
      @update:model-value="onInput"
      @blur="handleBlur"
    />
    <p v-if="hint && !errorMessage" class="text-xs text-muted-foreground">{{ hint }}</p>
    <FieldError :message="errorMessage" />
  </div>
</template>
