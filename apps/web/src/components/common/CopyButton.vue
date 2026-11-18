<script setup lang="ts">
import { ref } from 'vue';
import { CheckIcon, CopyIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';

const props = defineProps<{ text: string; label?: string; size?: 'sm' | 'default' | 'icon-sm' }>();
const copied = ref(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    toast.error('No se pudo copiar al portapapeles');
  }
}
</script>

<template>
  <Button variant="outline" :size="size ?? 'sm'" type="button" @click="copy">
    <CheckIcon v-if="copied" class="text-emerald-600" />
    <CopyIcon v-else />
    <span v-if="label && size !== 'icon-sm'">{{ copied ? 'Copiado' : label }}</span>
  </Button>
</template>
