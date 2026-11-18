<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from 'cn'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <th
    data-slot="table-head"
    :class="cn('text-muted-foreground h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0', props.class)"
  >
    <slot />
  </th>
</template>
