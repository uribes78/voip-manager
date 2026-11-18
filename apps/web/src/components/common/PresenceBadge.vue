<script setup lang="ts">
import { Badge } from '@/components/ui/badge';
import { presenceDot, presenceLabel } from '@/lib/presence';
defineProps<{ state: string; message?: string | null }>();
</script>

<template>
  <Badge v-if="state !== 'not_set'" variant="outline" class="gap-1.5" :title="message ?? undefined">
    <span class="size-1.5 rounded-full" :class="presenceDot(state)" />
    {{ presenceLabel(state) }}<span v-if="message" class="text-muted-foreground"> · {{ message }}</span>
  </Badge>
</template>
