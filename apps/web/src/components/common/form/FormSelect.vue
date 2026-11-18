<script setup lang="ts">
import { useField } from 'vee-validate';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FieldError from './FieldError.vue';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

const props = defineProps<{
  name: string;
  label: string;
  options: readonly SelectOption[] | readonly string[];
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}>();

const { value, errorMessage } = useField<string | undefined>(() => props.name);

const normalized = () =>
  (props.options as readonly (SelectOption | string)[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
</script>

<template>
  <div class="space-y-1.5">
    <Label :for="name">{{ label }}</Label>
    <Select :model-value="value" :disabled="disabled" @update:model-value="(v) => (value = v == null ? undefined : String(v))">
      <SelectTrigger :id="name" class="w-full" :aria-invalid="!!errorMessage">
        <SelectValue :placeholder="placeholder ?? 'Selecciona…'" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="opt in normalized()" :key="opt.value" :value="opt.value">
          <span>{{ opt.label }}</span>
          <span v-if="opt.description" class="ml-2 text-xs text-muted-foreground">{{ opt.description }}</span>
        </SelectItem>
      </SelectContent>
    </Select>
    <p v-if="hint && !errorMessage" class="text-xs text-muted-foreground">{{ hint }}</p>
    <FieldError :message="errorMessage" />
  </div>
</template>
