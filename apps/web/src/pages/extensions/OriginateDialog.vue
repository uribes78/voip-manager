<script setup lang="ts">
import { ref, watch } from 'vue';
import { useForm } from 'vee-validate';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { PhoneOutgoingIcon } from '@lucide/vue';
import { OriginateInput, type OriginateResult } from '@voip-manager/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormNumber, FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { errorMessage } from '@/lib/api';
import { amiService } from '@/services';

const props = defineProps<{ from?: string; context?: string }>();
const open = defineModel<boolean>('open', { default: false });
const result = ref<OriginateResult | null>(null);

const form = useForm({ validationSchema: toTypedSchema(OriginateInput) });

watch(open, (v) => {
  if (v) {
    result.value = null;
    form.resetForm({
      values: { from: props.from ?? '', to: '', context: props.context ?? 'from-internal', timeout: 30, callerId: undefined, playback: undefined },
    });
  }
});

const mutation = useMutation({
  mutationFn: (values: OriginateInput) => amiService.originate(values),
  onSuccess: (r) => {
    result.value = r;
    if (r.ok) toast.success('Llamada originada', { description: r.message ?? r.response });
  },
  onError: (e) => toast.error('No se pudo originar la llamada', { description: errorMessage(e) }),
});

const submit = form.handleSubmit((values) => mutation.mutate(values));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <form class="space-y-4" novalidate @submit="submit">
        <DialogHeader>
          <DialogTitle>Probar llamada (Originate)</DialogTitle>
          <DialogDescription>Asterisk timbra la extensión origen y, al contestar, marca al destino o reproduce un audio.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormText name="from" label="Extensión origen" mono />
          <FormText name="to" label="Destino" placeholder="1002 o número externo" mono />
          <FormText name="context" label="Contexto" mono />
          <FormNumber name="timeout" label="Timeout (s)" :min="5" :max="120" />
          <FormText name="callerId" label="Caller ID (opcional)" placeholder="Prueba <999>" />
          <FormText name="playback" label="Audio (opcional)" placeholder="hello-world" hint="Si se indica, se reproduce en lugar de marcar al destino." mono />
        </div>
        <Alert v-if="result" :variant="result.ok ? 'default' : 'destructive'">
          <AlertTitle>{{ result.response }}</AlertTitle>
          <AlertDescription class="font-mono text-xs">{{ result.message ?? `ActionID ${result.actionId}` }}</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">Cerrar</Button>
          <Button type="submit" :disabled="mutation.isPending.value"><PhoneOutgoingIcon /> Llamar</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
