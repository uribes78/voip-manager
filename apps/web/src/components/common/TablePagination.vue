<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const props = defineProps<{ total: number; pageSizes?: number[] }>();
const page = defineModel<number>('page', { default: 1 });
const pageSize = defineModel<number>('pageSize', { default: 25 });

const pages = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)));
const from = computed(() => (props.total === 0 ? 0 : (page.value - 1) * pageSize.value + 1));
const to = computed(() => Math.min(props.total, page.value * pageSize.value));
const sizes = computed(() => props.pageSizes ?? [10, 25, 50, 100]);

function setSize(v: unknown) {
  pageSize.value = Number(v);
  page.value = 1;
}
</script>

<template>
  <div class="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2">
      <span>Filas por página</span>
      <Select :model-value="String(pageSize)" @update:model-value="setSize">
        <SelectTrigger size="sm" class="w-18"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in sizes" :key="s" :value="String(s)">{{ s }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex items-center gap-3">
      <span class="tabular-nums">{{ from }}–{{ to }} de {{ total }}</span>
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" :disabled="page <= 1" aria-label="Anterior" @click="page -= 1">
          <ChevronLeftIcon />
        </Button>
        <span class="px-1 tabular-nums">{{ page }} / {{ pages }}</span>
        <Button variant="outline" size="icon-sm" :disabled="page >= pages" aria-label="Siguiente" @click="page += 1">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  </div>
</template>
