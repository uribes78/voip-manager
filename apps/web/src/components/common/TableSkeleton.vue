<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';

withDefaults(defineProps<{ rows?: number; cols: number }>(), { rows: 6 });
</script>

<template>
  <TableRow v-for="r in rows" :key="r">
    <TableCell v-for="c in cols" :key="c"><Skeleton class="h-4 w-full max-w-40" /></TableCell>
  </TableRow>
</template>
