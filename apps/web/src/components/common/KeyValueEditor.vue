<script setup lang="ts">
import { computed, ref } from 'vue';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import EmptyState from './EmptyState.vue';

const props = defineProps<{
  /** Lista blanca de columnas para autocompletar. */
  columns: readonly string[];
  title?: string;
  description?: string;
  disabled?: boolean;
}>();

const model = defineModel<Record<string, string>>({ default: () => ({}) });

const entries = computed(() => Object.entries(model.value));
const newKey = ref('');
const newValue = ref('');
const open = ref(false);

const availableColumns = computed(() => props.columns.filter((c) => !(c in model.value)));

function add() {
  const key = newKey.value.trim();
  if (!key) return;
  model.value = { ...model.value, [key]: newValue.value };
  newKey.value = '';
  newValue.value = '';
}

function setValue(key: string, value: string | number) {
  model.value = { ...model.value, [key]: String(value) };
}

function remove(key: string) {
  const copy = { ...model.value };
  delete copy[key];
  model.value = copy;
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="title">
      <p class="text-sm font-medium">{{ title }}</p>
      <p v-if="description" class="text-xs text-muted-foreground">{{ description }}</p>
    </div>

    <div v-if="entries.length" class="divide-y rounded-lg border">
      <div v-for="[key, value] in entries" :key="key" class="grid grid-cols-[1fr_1.5fr_auto] items-center gap-2 px-3 py-2">
        <code class="truncate text-xs">{{ key }}</code>
        <Input :model-value="value" :disabled="disabled" class="h-7 text-xs" @update:model-value="setValue(key, $event)" />
        <Button variant="ghost" size="icon-sm" type="button" :disabled="disabled" aria-label="Quitar" @click="remove(key)">
          <Trash2Icon class="text-destructive" />
        </Button>
      </div>
    </div>
    <EmptyState v-else title="Sin opciones avanzadas" description="Agrega columnas de Asterisk que no están en el formulario general." class="py-6" />

    <div v-if="!disabled" class="grid grid-cols-[1fr_1.5fr_auto] items-center gap-2">
      <Popover v-model:open="open">
        <PopoverTrigger as-child>
          <Button variant="outline" role="combobox" type="button" class="justify-between font-normal">
            <span class="truncate" :class="!newKey && 'text-muted-foreground'">{{ newKey || 'Columna…' }}</span>
            <ChevronsUpDownIcon class="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar columna…" />
            <CommandList>
              <CommandEmpty>Sin coincidencias</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="col in availableColumns"
                  :key="col"
                  :value="col"
                  @select="
                    () => {
                      newKey = col;
                      open = false;
                    }
                  "
                >
                  <CheckIcon class="mr-2 size-4" :class="newKey === col ? 'opacity-100' : 'opacity-0'" />
                  <span class="font-mono text-xs">{{ col }}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input v-model="newValue" placeholder="Valor" @keydown.enter.prevent="add" />
      <Button type="button" variant="secondary" :disabled="!newKey" @click="add"><PlusIcon /> Agregar</Button>
    </div>
  </div>
</template>
