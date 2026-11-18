<script setup lang="ts">
import { useField } from 'vee-validate';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FieldError from './FieldError.vue';

const props = defineProps<{
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  autocomplete?: string;
  mono?: boolean;
}>();

const { value, errorMessage, handleBlur } = useField<string | undefined>(() => props.name);

function onInput(v: string | number) {
  const s = String(v);
  value.value = s === '' ? undefined : s;
}
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="name">{{ label }}</Label>
    <Input
      :id="name"
      :type="type ?? 'text'"
      :model-value="value ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="!!errorMessage"
      :class="mono && 'font-mono'"
      @update:model-value="onInput"
      @blur="handleBlur"
    />
    <slot name="after" />
    <p v-if="hint && !errorMessage" class="text-xs text-muted-foreground">{{ hint }}</p>
    <FieldError :message="errorMessage" />
  </div>
</template>
