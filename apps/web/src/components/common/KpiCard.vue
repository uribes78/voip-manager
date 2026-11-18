<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

defineProps<{
  label: string;
  value?: string | number | null;
  hint?: string;
  loading?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}>();

const tones: Record<string, string> = {
  default: 'text-foreground',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-destructive',
};
</script>

<template>
  <Card>
    <CardContent class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{{ label }}</p>
        <Skeleton v-if="loading" class="mt-2 h-8 w-20" />
        <p v-else class="mt-1 text-xl font-semibold tracking-tight tabular-nums" :class="tones[tone ?? 'default']">
          {{ value ?? '—' }}
        </p>
        <p v-if="hint" class="mt-1 truncate text-xs text-muted-foreground" :title="hint">{{ hint }}</p>
      </div>
      <div v-if="$slots.icon" class="rounded-full bg-primary/10 p-2 text-primary"><slot name="icon" /></div>
    </CardContent>
  </Card>
</template>
