<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import { deviceStateLabel, deviceStateVariant } from '@/lib/format';

const props = defineProps<{
  online?: boolean;
  deviceState?: string;
  deleted?: boolean;
  unknown?: boolean;
}>();

const label = computed(() => {
  if (props.deleted) return 'Eliminada';
  if (props.unknown || props.online === undefined) return 'Sin datos';
  if (!props.online) return 'Desconectada';
  return deviceStateLabel(props.deviceState);
});

const variant = computed(() => {
  if (props.deleted) return 'outline';
  if (props.unknown || props.online === undefined) return 'outline';
  if (!props.online) return 'destructive';
  return deviceStateVariant(props.deviceState);
});

const dotClass = computed(() => {
  if (props.deleted || props.unknown || props.online === undefined) return 'bg-muted-foreground/50';
  if (!props.online) return 'bg-destructive';
  const s = (props.deviceState ?? '').toLowerCase();
  if (s === 'not in use') return 'bg-emerald-500';
  if (s === 'unavailable' || s === 'invalid') return 'bg-destructive';
  return 'bg-amber-500';
});
</script>

<template>
  <Badge :variant="variant" class="gap-1.5">
    <span class="size-1.5 rounded-full" :class="dotClass" />
    {{ label }}
  </Badge>
</template>
