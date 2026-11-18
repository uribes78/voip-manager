<script setup lang="ts">
import { ref } from 'vue';
import { useField } from 'vee-validate';
import { PlusIcon, XIcon } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/common/form';

const props = defineProps<{ name: string; disabled?: boolean }>();
const { value, errorMessage } = useField<string[] | undefined>(() => props.name);
const draft = ref('');

function add() {
  const v = draft.value.trim();
  if (!v) return;
  value.value = [...(value.value ?? []), v];
  draft.value = '';
}
function remove(i: number) {
  value.value = (value.value ?? []).filter((_, idx) => idx !== i);
}
</script>

<template>
  <div class="space-y-1.5">
    <Label>Direcciones adicionales (IP o CIDR)</Label>
    <div class="flex gap-2">
      <Input v-model="draft" placeholder="203.0.113.10 o 10.0.0.0/24" class="font-mono" :disabled="disabled" @keydown.enter.prevent="add" />
      <Button type="button" variant="secondary" :disabled="disabled || !draft" @click="add"><PlusIcon /> Agregar</Button>
    </div>
    <div class="flex flex-wrap gap-1.5 pt-1">
      <Badge v-for="(addr, i) in value ?? []" :key="addr + i" variant="secondary" class="font-mono">
        {{ addr }}
        <button v-if="!disabled" type="button" class="ml-0.5 rounded-full hover:text-destructive" aria-label="Quitar" @click="remove(i)"><XIcon class="size-3" /></button>
      </Badge>
      <span v-if="!(value ?? []).length" class="text-xs text-muted-foreground">El host principal siempre se incluye en la identificación.</span>
    </div>
    <FieldError :message="errorMessage" />
  </div>
</template>
