<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { CheckIcon, ChevronsUpDownIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { queuesService } from '@/services';
import { errorMessage } from '@/lib/api';

const props = defineProps<{ queue: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ added: [] }>();

const extensionId = ref('');
const penalty = ref(0);
const paused = ref(false);
const pickerOpen = ref(false);

const available = useQuery({
  queryKey: computed(() => ['queues', props.queue, 'available']),
  queryFn: () => queuesService.availableExtensions(props.queue),
  enabled: open,
});

watch(open, (v) => {
  if (v) {
    extensionId.value = '';
    penalty.value = 0;
    paused.value = false;
    available.refetch();
  }
});

const selected = computed(() => available.data.value?.find((e) => e.id === extensionId.value));

const add = useMutation({
  mutationFn: () => queuesService.addMember(props.queue, { extensionId: extensionId.value, penalty: penalty.value, paused: paused.value }),
  onSuccess: () => {
    toast.success(`Extensión ${extensionId.value} agregada a ${props.queue}`);
    open.value = false;
    emit('added');
  },
  onError: (e) => toast.error('No se pudo agregar', { description: errorMessage(e) }),
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Agregar miembro a {{ queue }}</DialogTitle>
        <DialogDescription>Solo se listan extensiones activas que aún no están en la cola.</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-1.5">
          <Label>Extensión</Label>
          <Popover v-model:open="pickerOpen">
            <PopoverTrigger as-child>
              <Button variant="outline" role="combobox" class="w-full justify-between font-normal">
                <span v-if="selected" class="truncate"><span class="font-mono">{{ selected.id }}</span> · {{ selected.displayName }}</span>
                <span v-else class="text-muted-foreground">Selecciona una extensión…</span>
                <ChevronsUpDownIcon class="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-(--reka-popover-trigger-width) p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar extensión…" />
                <CommandList>
                  <CommandEmpty>{{ available.isPending.value ? 'Cargando…' : 'No hay extensiones disponibles' }}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem v-for="e in available.data.value" :key="e.id" :value="`${e.id} ${e.displayName}`" @select="extensionId = e.id; pickerOpen = false">
                      <CheckIcon class="mr-2 size-4" :class="extensionId === e.id ? 'opacity-100' : 'opacity-0'" />
                      <span class="font-mono">{{ e.id }}</span><span class="ml-2 text-muted-foreground">{{ e.displayName }}</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <Label for="penalty">Penalty</Label>
            <Input id="penalty" type="number" min="0" max="100" :model-value="penalty" @update:model-value="(v) => (penalty = Number(v))" />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <Switch id="paused" :model-value="paused" @update:model-value="(v: boolean) => (paused = v)" />
            <Label for="paused">Iniciar en pausa</Label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancelar</Button>
        <Button :disabled="!extensionId || add.isPending.value" @click="add.mutate()">Agregar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
