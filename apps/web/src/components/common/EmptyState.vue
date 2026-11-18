<script setup lang="ts">
import { InboxIcon } from '@lucide/vue';

defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
    <div class="rounded-full bg-muted p-3 text-muted-foreground">
      <slot name="icon"><InboxIcon class="size-6" /></slot>
    </div>
    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="description" class="max-w-sm text-sm text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.default" class="mt-2"><slot /></div>
  </div>
</template>
