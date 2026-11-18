<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import {
  FolderIcon, FolderXIcon, LoaderCircleIcon, MusicIcon, PencilIcon, PlayIcon, PlusIcon, RefreshCwIcon, SquareIcon, Trash2Icon, UploadIcon,
} from '@lucide/vue';
import type { MohClass } from '@voip-manager/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import PageHeader from '@/components/common/PageHeader.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import MohClassDialog from './MohClassDialog.vue';
import { mohService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const qc = useQueryClient();
const canWrite = computed(() => auth.hasPermission('moh:write'));

const list = useQuery({ queryKey: ['moh'], queryFn: mohService.list, refetchInterval: 30_000 });
const classes = computed(() => list.data.value?.classes ?? []);
const environment = computed(() => list.data.value?.environment);

const selectedName = ref<string>('');
watch(classes, (c) => {
  if (!c.length) return;
  if (!c.some((x) => x.name === selectedName.value)) selectedName.value = c.find((x) => x.name === 'default')?.name ?? c[0]!.name;
}, { immediate: true });
const selected = computed(() => classes.value.find((c) => c.name === selectedName.value) ?? null);

const files = useQuery({
  queryKey: computed(() => ['moh', selectedName.value, 'files']),
  queryFn: () => mohService.files(selectedName.value),
  enabled: computed(() => !!selected.value && selected.value.mode === 'files' && selected.value.directoryInfo.accessible),
  retry: false,
});

// ---- diálogos ----
const dialogOpen = ref(false);
const editing = ref<MohClass | null>(null);
function openCreate() {
  editing.value = null;
  dialogOpen.value = true;
}
function openEdit(cls: MohClass) {
  editing.value = cls;
  dialogOpen.value = true;
}
const deleteOpen = ref(false);
const deleteFilesToo = ref(false);
const remove = useMutation({
  mutationFn: () => mohService.remove(selectedName.value, deleteFilesToo.value),
  onSuccess: () => {
    toast.success(`Clase ${selectedName.value} eliminada`);
    qc.invalidateQueries({ queryKey: ['moh'] });
    deleteOpen.value = false;
  },
  onError: (e) => toast.error('No se pudo eliminar', { description: errorMessage(e) }),
});
const reload = useMutation({
  mutationFn: mohService.reload,
  onSuccess: (r) => {
    qc.invalidateQueries({ queryKey: ['moh'] });
    r.ok ? toast.success('Música en espera recargada', { description: r.response }) : toast.error('No se pudo recargar', { description: r.response });
  },
  onError: (e) => toast.error('No se pudo recargar', { description: errorMessage(e) }),
});

// ---- subida ----
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const upload = useMutation({
  mutationFn: (fs: File[]) => mohService.upload(selectedName.value, fs),
  onSuccess: (r) => {
    const ok = r.files.filter((f) => f.stored);
    const bad = r.files.filter((f) => !f.stored);
    if (ok.length) toast.success(`${ok.length} audio(s) guardados en ${selectedName.value}`, { description: ok.map((f) => `${f.original} → ${f.stored}${f.converted ? ' (convertido)' : ''}`).join('\n') });
    for (const f of bad) toast.error(`No se pudo subir ${f.original}`, { description: f.error ?? undefined });
    for (const w of r.warnings) toast.info(w);
    qc.invalidateQueries({ queryKey: ['moh'] });
  },
  onError: (e) => toast.error('Error al subir', { description: errorMessage(e) }),
});
function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const fs = Array.from(input.files ?? []);
  if (fs.length) upload.mutate(fs);
  input.value = '';
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  const fs = Array.from(e.dataTransfer?.files ?? []);
  if (fs.length && canWrite.value) upload.mutate(fs);
}
const deleteFile = useMutation({
  mutationFn: (file: string) => mohService.deleteFile(selectedName.value, file),
  onSuccess: (_r, file) => {
    toast.success(`${file} eliminado`);
    if (playing.value === file) stop();
    qc.invalidateQueries({ queryKey: ['moh'] });
  },
  onError: (e) => toast.error('No se pudo eliminar el archivo', { description: errorMessage(e) }),
});

// ---- previsualización ----
const playing = ref<string | null>(null);
let audio: HTMLAudioElement | null = null;
function stop() {
  audio?.pause();
  audio = null;
  playing.value = null;
}
function play(file: string) {
  if (playing.value === file) return stop();
  stop();
  audio = new Audio(mohService.previewUrl(selectedName.value, file, auth.accessToken ?? ''));
  audio.onended = () => (playing.value = null);
  audio.onerror = () => {
    toast.error('No se pudo reproducir el audio');
    playing.value = null;
  };
  playing.value = file;
  void audio.play();
}

const accept = computed(() => {
  const native = (environment.value?.nativeFormats ?? []).map((f) => `.${f}`);
  return [...native, ...(environment.value?.ffmpeg ? ['.mp3', '.ogg', '.m4a', '.aac', '.flac'] : [])].join(',');
});
</script>

<template>
  <PageHeader title="Música en espera" description="Clases MOH en la base de datos (realtime) y sus audios. Asterisk reproduce WAV 8 kHz mono, GSM, µ-law/A-law y SLN.">
    <Button v-if="canWrite" variant="outline" size="sm" :disabled="reload.isPending.value" @click="reload.mutate()">
      <RefreshCwIcon :class="reload.isPending.value && 'animate-spin'" /> moh reload
    </Button>
    <Button v-if="canWrite" size="sm" @click="openCreate"><PlusIcon /> Nueva clase</Button>
  </PageHeader>

  <Alert v-if="environment && !environment.mohPath" class="mb-4">
    <AlertTitle>Sin acceso a los audios</AlertTitle>
    <AlertDescription>
      Define <code>ASTERISK_MOH_PATH</code> (ruta local de <code>{{ environment.mohRemotePath }}</code>) para subir y administrar archivos desde aquí. Las clases sí se pueden definir.
    </AlertDescription>
  </Alert>

  <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
    <Card size="sm" class="self-start">
      <CardHeader>
        <CardTitle>Clases</CardTitle>
        <CardDescription>{{ classes.length }} definidas</CardDescription>
      </CardHeader>
      <CardContent class="px-2">
        <div v-if="list.isPending.value" class="space-y-2 px-1"><Skeleton v-for="i in 4" :key="i" class="h-10" /></div>
        <EmptyState v-else-if="list.isError.value" title="No se pudieron cargar" :description="errorMessage(list.error.value)" />
        <ul v-else class="space-y-0.5">
          <li v-for="c in classes" :key="c.name">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted"
              :class="selectedName === c.name && 'bg-muted'"
              @click="selectedName = c.name"
            >
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full" :class="c.directoryInfo.accessible || c.mode !== 'files' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'">
                <MusicIcon class="size-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="truncate text-sm font-medium">{{ c.name }}</span>
                  <Badge v-if="c.source === 'static'" variant="outline" class="h-4 px-1.5 text-[10px]">conf</Badge>
                </span>
                <span class="block truncate font-mono text-[11px] text-muted-foreground">{{ c.mode }} · {{ c.mode === 'files' ? (c.fileCount ?? '?') + ' audios' : c.mode === 'playlist' ? c.entries.length + ' entradas' : c.application }}</span>
              </span>
              <span class="size-1.5 shrink-0 rounded-full" :class="c.loaded ? 'bg-emerald-500' : 'bg-muted-foreground/40'" :title="c.loaded ? 'Cargada en Asterisk' : 'Se cargará al primer uso'" />
            </button>
          </li>
        </ul>
      </CardContent>
    </Card>

    <div v-if="selected" class="space-y-4">
      <Card>
        <CardHeader class="border-b">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <CardTitle class="flex items-center gap-2">{{ selected.name }}
                <Badge variant="outline">{{ selected.mode }}</Badge>
                <Badge :variant="selected.loaded ? 'default' : 'secondary'">{{ selected.loaded ? 'cargada' : 'carga al primer uso' }}</Badge>
              </CardTitle>
              <CardDescription class="font-mono text-xs">
                {{ selected.directoryInfo.asteriskPath }}
                <span v-if="selected.directoryInfo.localPath" class="text-muted-foreground/70"> → {{ selected.directoryInfo.localPath }}</span>
              </CardDescription>
            </div>
            <div v-if="canWrite && selected.source === 'realtime'" class="flex gap-2">
              <Button variant="outline" size="sm" @click="openEdit(selected)"><PencilIcon /> Editar</Button>
              <Button variant="destructive" size="sm" :disabled="selected.name === 'default'" @click="deleteFilesToo = false; deleteOpen = true"><Trash2Icon /> Eliminar</Button>
            </div>
            <p v-else-if="selected.source === 'static'" class="text-xs text-muted-foreground">Definida en musiconhold.conf; edítala desde Configuración.</p>
          </div>
        </CardHeader>
        <CardContent class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p class="text-xs text-muted-foreground">Orden</p><p class="font-mono">{{ selected.sort }}</p></div>
          <div><p class="text-xs text-muted-foreground">Dígito</p><p class="font-mono">{{ selected.digit || '—' }}</p></div>
          <div><p class="text-xs text-muted-foreground">Repetir última</p><p>{{ selected.loopLast ? 'Sí' : 'No' }}</p></div>
          <div><p class="text-xs text-muted-foreground">Actualizada</p><p>{{ formatDateTime(selected.stamp) }}</p></div>
          <div v-if="selected.mode === 'custom'" class="sm:col-span-2 lg:col-span-4"><p class="text-xs text-muted-foreground">Comando</p><p class="font-mono text-xs">{{ selected.application }}</p></div>
          <div v-if="selected.mode === 'playlist'" class="sm:col-span-2 lg:col-span-4">
            <p class="text-xs text-muted-foreground">Entradas</p>
            <ol class="mt-1 list-inside list-decimal font-mono text-xs">
              <li v-for="e in selected.entries" :key="e">{{ e }}</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card v-if="selected.mode === 'files'" class="overflow-hidden">
        <CardHeader class="border-b">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Audios</CardTitle>
              <CardDescription>
                Los WAV se convierten a 8 kHz mono 16 bits. {{ environment?.ffmpeg ? 'Con ffmpeg también se aceptan MP3, OGG, M4A, FLAC.' : 'Instala ffmpeg en el servidor para aceptar MP3/OGG/M4A.' }}
              </CardDescription>
            </div>
            <div v-if="canWrite && selected.directoryInfo.accessible" class="flex items-center gap-2">
              <input ref="fileInput" type="file" multiple class="hidden" :accept="accept" @change="onPick" />
              <Button size="sm" :disabled="upload.isPending.value" @click="fileInput?.click()">
                <LoaderCircleIcon v-if="upload.isPending.value" class="animate-spin" />
                <UploadIcon v-else />
                Subir audios
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <EmptyState v-if="!selected.directoryInfo.accessible" title="Directorio no mapeado" :description="`${selected.directoryInfo.asteriskPath} no está dentro de ASTERISK_MOH_PATH ni de ASTERISK_PATH_MAP. Sube los audios por otro medio o agrega el mapeo.`">
            <template #icon><FolderXIcon class="size-5" /></template>
          </EmptyState>
          <div
            v-else
            class="relative"
            :class="dragging && 'ring-2 ring-primary ring-inset'"
            @dragover.prevent="dragging = canWrite"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-10" />
                  <TableHead>Archivo</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead class="text-right">Duración</TableHead>
                  <TableHead class="hidden text-right sm:table-cell">Tamaño</TableHead>
                  <TableHead class="hidden md:table-cell">Modificado</TableHead>
                  <TableHead class="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableSkeleton v-if="files.isPending.value" :cols="7" />
                <TableRow v-else-if="files.isError.value"><TableCell colspan="7" class="p-0"><EmptyState title="No se pudo listar" :description="errorMessage(files.error.value)" /></TableCell></TableRow>
                <TableRow v-else-if="!files.data.value?.length">
                  <TableCell colspan="7" class="p-0">
                    <EmptyState title="Sin audios" :description="canWrite ? 'Arrastra archivos aquí o usa “Subir audios”.' : 'Esta clase todavía no tiene audios.'">
                      <template #icon><FolderIcon class="size-5" /></template>
                    </EmptyState>
                  </TableCell>
                </TableRow>
                <TableRow v-for="f in files.data.value" :key="f.name">
                  <TableCell>
                    <Button v-if="f.previewable" variant="ghost" size="icon-sm" :aria-label="playing === f.name ? 'Detener' : 'Reproducir'" @click="play(f.name)">
                      <SquareIcon v-if="playing === f.name" class="text-primary" />
                      <PlayIcon v-else />
                    </Button>
                  </TableCell>
                  <TableCell class="font-mono text-xs">{{ f.name }}</TableCell>
                  <TableCell>
                    <Badge :variant="f.playable ? 'outline' : 'destructive'" class="font-mono">{{ f.format }}</Badge>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ f.durationSec != null ? formatDuration(Math.round(f.durationSec)) : '—' }}</TableCell>
                  <TableCell class="hidden text-right tabular-nums sm:table-cell">{{ formatBytes(f.sizeBytes) }}</TableCell>
                  <TableCell class="hidden text-xs text-muted-foreground md:table-cell">{{ formatDateTime(f.modifiedAt) }}</TableCell>
                  <TableCell>
                    <Button v-if="canWrite" variant="ghost" size="icon-sm" aria-label="Eliminar" :disabled="deleteFile.isPending.value" @click="deleteFile.mutate(f.name)"><Trash2Icon /></Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div v-if="dragging" class="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium text-primary">Suelta para subir</div>
          </div>
        </CardContent>
      </Card>
    </div>
    <EmptyState v-else-if="!list.isPending.value" title="Sin clases" description="Crea una clase para empezar." />
  </div>

  <MohClassDialog v-model:open="dialogOpen" :editing="editing" :environment="environment" @saved="(c) => (selectedName = c.name)" />
  <ConfirmDialog
    v-model:open="deleteOpen"
    :title="`Eliminar clase ${selectedName}`"
    description="Se quita de la base de datos y de Asterisk. Las extensiones o colas que la usen volverán a la clase default."
    confirm-label="Eliminar"
    destructive
    :loading="remove.isPending.value"
    @confirm="remove.mutate()"
  >
    <div class="flex items-center gap-2 pt-2">
      <Checkbox id="moh-delete-files" v-model="deleteFilesToo" />
      <Label for="moh-delete-files" class="text-sm">Eliminar también los audios del directorio</Label>
    </div>
  </ConfirmDialog>
</template>
