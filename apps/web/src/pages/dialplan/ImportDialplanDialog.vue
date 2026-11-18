<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { parseDialplan } from './parseDialplan';
import { dialplanService } from '@/services';
import { errorMessage } from '@/lib/api';

const props = defineProps<{ context: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ imported: [context: string] }>();

const contextName = ref('');
const text = ref('');
const replace = ref(false);

watch(open, (v) => {
  if (v) {
    contextName.value = props.context;
    text.value = '';
    replace.value = false;
  }
});

const parsed = computed(() => parseDialplan(text.value));
const canSubmit = computed(() => contextName.value.trim().length > 0 && parsed.value.lines.length > 0);

const importMutation = useMutation({
  mutationFn: () => dialplanService.bulk({ context: contextName.value.trim(), replace: replace.value, lines: parsed.value.lines }),
  onSuccess: (lines) => {
    toast.success(`${lines.length} líneas importadas en ${contextName.value}`);
    open.value = false;
    emit('imported', contextName.value.trim());
  },
  onError: (e) => toast.error('No se pudo importar', { description: errorMessage(e) }),
});

const example = `exten => _1XXX,1,NoOp(Llamada interna a \${EXTEN})
same  => n,Dial(PJSIP/\${EXTEN},30,tT)
same  => n,Hangup()`;
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Importar plan de marcado</DialogTitle>
        <DialogDescription>Pega líneas con sintaxis de extensions.conf. Las prioridades <code>n</code> se numeran automáticamente.</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div class="space-y-1.5">
            <Label for="ctx">Contexto</Label>
            <Input id="ctx" v-model="contextName" placeholder="from-internal" class="font-mono" :disabled="!!context" />
          </div>
          <div class="flex items-center gap-2 pt-6">
            <Switch id="replace" :model-value="replace" @update:model-value="(v: boolean) => (replace = v)" />
            <Label for="replace">Reemplazar contexto</Label>
          </div>
        </div>
        <div class="space-y-1.5">
          <Label for="text">Líneas</Label>
          <Textarea id="text" v-model="text" :placeholder="example" rows="10" class="font-mono text-xs" />
        </div>
        <Alert v-if="parsed.errors.length" variant="destructive">
          <AlertTitle>{{ parsed.errors.length }} líneas con problemas</AlertTitle>
          <AlertDescription><ul class="list-disc pl-4 text-xs"><li v-for="e in parsed.errors.slice(0, 6)" :key="e">{{ e }}</li></ul></AlertDescription>
        </Alert>
        <p class="text-xs text-muted-foreground">
          {{ parsed.lines.length }} líneas válidas detectadas.
          <span v-if="replace" class="text-destructive">Se borrarán las líneas actuales del contexto antes de insertar.</span>
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancelar</Button>
        <Button :disabled="!canSubmit || importMutation.isPending.value" @click="importMutation.mutate()">Importar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
