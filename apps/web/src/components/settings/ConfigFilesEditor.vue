<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { FileWarningIcon, HardDriveIcon, LoaderCircleIcon, RadioIcon, RotateCcwIcon, SaveIcon } from '@lucide/vue';
import type { ConfigFileInfo } from '@voip-manager/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import IniEditor from '@/components/common/IniEditor.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { settingsService } from '@/services';
import { ApiError, errorMessage } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{ initialFile?: string }>();
const auth = useAuthStore();
const qc = useQueryClient();
const canWrite = computed(() => auth.hasPermission('settings:write'));

const files = useQuery({ queryKey: ['settings', 'files'], queryFn: settingsService.files, staleTime: 30_000 });
const selected = ref<string>(props.initialFile ?? 'features.conf');
const content = useQuery({
  queryKey: computed(() => ['settings', 'files', selected.value]),
  queryFn: () => settingsService.readFile(selected.value),
  enabled: computed(() => !!selected.value),
  retry: false,
});

const draft = ref('');
const reloadAfterSave = ref(true);
watch(
  () => content.data.value,
  (c) => {
    if (c) draft.value = c.content;
  },
  { immediate: true },
);
const dirty = computed(() => !!content.data.value && draft.value !== content.data.value.content);
const current = computed(() => files.data.value?.find((f) => f.file === selected.value));

function select(file: ConfigFileInfo) {
  if (dirty.value && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
  selected.value = file.file;
}

const save = useMutation({
  mutationFn: () => settingsService.writeFile(selected.value, { content: draft.value, hash: content.data.value?.hash, reload: reloadAfterSave.value }),
  onSuccess: (r) => {
    qc.invalidateQueries({ queryKey: ['settings', 'files'] });
    qc.invalidateQueries({ queryKey: ['settings', 'features'] });
    if (r.reload) {
      r.reload.ok
        ? toast.success(`${r.file} guardado y recargado`, { description: r.reload.response.split('\n').slice(-1)[0] })
        : toast.warning(`${r.file} guardado, pero la recarga falló`, { description: r.reload.response });
    } else {
      toast.success(`${r.file} guardado`);
    }
    for (const w of r.warnings) toast.info(w);
  },
  onError: (e) => {
    if (e instanceof ApiError && e.status === 409) {
      toast.error('Conflicto de edición', { description: errorMessage(e), action: { label: 'Recargar', onClick: () => content.refetch() } });
    } else {
      toast.error('No se pudo guardar', { description: errorMessage(e) });
    }
  },
});

function discard() {
  draft.value = content.data.value?.content ?? '';
}
const grouped = computed(() => ({
  catalog: files.data.value?.filter((f) => f.catalog) ?? [],
  extra: files.data.value?.filter((f) => !f.catalog) ?? [],
}));
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[260px_1fr]">
    <Card size="sm" class="self-start">
      <CardHeader>
        <CardTitle>Archivos</CardTitle>
        <CardDescription>
          <template v-if="files.data.value?.[0]?.backend === 'fs'"><HardDriveIcon class="mr-1 inline size-3.5" />Carpeta local de Asterisk</template>
          <template v-else-if="files.data.value?.[0]?.backend === 'ami'"><RadioIcon class="mr-1 inline size-3.5" />Vía AMI (sin comentarios)</template>
          <template v-else>Sin acceso a los archivos</template>
        </CardDescription>
      </CardHeader>
      <CardContent class="px-2">
        <div v-if="files.isPending.value" class="space-y-2 px-1"><Skeleton v-for="i in 6" :key="i" class="h-7" /></div>
        <ScrollArea v-else class="max-h-[60vh]">
          <ul class="space-y-0.5">
            <li v-for="f in [...grouped.catalog, ...grouped.extra]" :key="f.file">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted"
                :class="selected === f.file ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground'"
                :title="f.description"
                @click="select(f)"
              >
                <span class="truncate">{{ f.file }}</span>
                <span v-if="!f.exists" class="size-1.5 shrink-0 rounded-full bg-amber-500" title="No existe todavía" />
              </button>
            </li>
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="border-b">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <CardTitle class="font-mono">{{ selected }}</CardTitle>
            <CardDescription>{{ current?.description }}</CardDescription>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Badge variant="outline" class="font-mono">{{ content.data.value?.backend === 'fs' ? 'archivo' : content.data.value?.backend ?? '—' }}</Badge>
            <Badge v-if="dirty" variant="secondary">Sin guardar</Badge>
            <Badge v-if="current?.reloadCommand" variant="outline" class="font-mono" :title="current.reloadCommand">recarga en caliente</Badge>
            <Badge v-else-if="current" variant="destructive">requiere reinicio</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <Skeleton v-if="content.isPending.value" class="h-96 w-full" />
        <EmptyState v-else-if="content.isError.value" title="No se pudo leer el archivo" :description="errorMessage(content.error.value)">
          <template #icon><FileWarningIcon class="size-5" /></template>
        </EmptyState>
        <template v-else-if="content.data.value">
          <Alert v-if="!content.data.value.commentsPreserved">
            <AlertTitle>Edición por AMI</AlertTitle>
            <AlertDescription>
              Asterisk devuelve solo categorías y valores: los comentarios del archivo original se pierden al guardar. Para conservarlos define
              <code>ASTERISK_ETC_PATH</code> en el servicio apuntando a <code>/etc/asterisk</code>.
            </AlertDescription>
          </Alert>
          <IniEditor v-model="draft" :readonly="!canWrite" @save="canWrite && dirty && save.mutate()" />
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-xs text-muted-foreground">
              <template v-if="content.data.value.path">{{ content.data.value.path }} · </template>
              <template v-if="current?.sizeBytes != null">{{ formatBytes(current.sizeBytes) }} · </template>
              <template v-if="content.data.value.modifiedAt">modificado {{ formatDateTime(content.data.value.modifiedAt) }}</template>
              <template v-else>archivo nuevo</template>
            </p>
            <div v-if="canWrite" class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <Switch id="reload-after-save" v-model="reloadAfterSave" size="sm" :disabled="!current?.reloadCommand" />
                <Label for="reload-after-save" class="text-xs" :title="current?.reloadCommand ?? 'Este archivo requiere reiniciar Asterisk'">Recargar módulo</Label>
              </div>
              <Button variant="outline" size="sm" :disabled="!dirty || save.isPending.value" @click="discard"><RotateCcwIcon /> Descartar</Button>
              <Button size="sm" :disabled="!dirty || save.isPending.value" @click="save.mutate()">
                <LoaderCircleIcon v-if="save.isPending.value" class="animate-spin" />
                <SaveIcon v-else />
                Guardar
              </Button>
            </div>
            <p v-else class="text-xs text-muted-foreground">Solo lectura: se requiere el permiso settings:write.</p>
          </div>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
