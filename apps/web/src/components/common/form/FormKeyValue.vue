<script setup lang="ts">
import { useField } from 'vee-validate';
import KeyValueEditor from '@/components/common/KeyValueEditor.vue';
import FieldError from './FieldError.vue';

const props = defineProps<{ name: string; columns: readonly string[]; title: string; description?: string; disabled?: boolean }>();
const { value, errorMessage } = useField<Record<string, string> | undefined>(() => props.name);
</script>

<template>
  <div class="space-y-2">
    <KeyValueEditor
      :model-value="value ?? {}"
      :columns="columns"
      :title="title"
      :description="description"
      :disabled="disabled"
      @update:model-value="(v) => (value = v)"
    />
    <FieldError :message="errorMessage" />
  </div>
</template>
