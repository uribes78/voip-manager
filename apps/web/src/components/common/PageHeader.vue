<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-lg font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-0.5 text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
