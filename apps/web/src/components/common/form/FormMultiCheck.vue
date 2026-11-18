<script setup lang="ts">
import { useField } from 'vee-validate';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import FieldError from './FieldError.vue';

const props = defineProps<{ name: string; label: string; options: readonly string[]; hint?: string; disabled?: boolean }>();
const { value, errorMessage } = useField<string[] | undefined>(() => props.name);

function toggle(opt: string, checked: boolean | 'indeterminate') {
  const current = new Set(value.value ?? []);
  if (checked === true) current.add(opt);
  else current.delete(opt);
  // Conserva el orden de la lista de opciones: en Asterisk el orden de codecs importa.
  value.value = props.options.filter((o) => current.has(o));
}
</script>

<template>
  <div class="space-y-1.5">
    <Label>{{ label }}</Label>
    <div class="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
      <label v-for="opt in options" :key="opt" class="flex items-center gap-2 text-sm">
        <Checkbox
          :model-value="(value ?? []).includes(opt)"
          :disabled="disabled"
          @update:model-value="(c: boolean | 'indeterminate') => toggle(opt, c)"
        />
        <span class="font-mono text-xs">{{ opt }}</span>
      </label>
    </div>
    <p v-if="hint && !errorMessage" class="text-xs text-muted-foreground">{{ hint }}</p>
    <FieldError :message="errorMessage" />
  </div>
</template>
