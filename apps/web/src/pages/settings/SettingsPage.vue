<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/common/PageHeader.vue';
import CopyButton from '@/components/common/CopyButton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TableSkeleton from '@/components/common/TableSkeleton.vue';
import TablePagination from '@/components/common/TablePagination.vue';
import ConfigFilesEditor from '@/components/settings/ConfigFilesEditor.vue';
import FeatureCodesCard from '@/components/settings/FeatureCodesCard.vue';
import { settingsService } from '@/services';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const config = useQuery({ queryKey: ['settings', 'asterisk-config'], queryFn: settingsService.asteriskConfig, staleTime: 60_000 });
const health = useQuery({ queryKey: ['health'], queryFn: settingsService.health, refetchInterval: 30_000 });

const section = ref<'features' | 'files' | 'templates' | 'audit'>('features');
const editorFile = ref('features.conf');
function openEditor(file: string) {
  editorFile.value = file;
  section.value = 'files';
}

const activeFile = ref('');
watch(
  () => config.data.value,
  (c) => {
    if (c?.snippets.length && !activeFile.value) activeFile.value = c.snippets[0]!.file;
  },
  { immediate: true },
);

const auditFilters = reactive({ page: 1, pageSize: 25 });
const audit = useQuery({ queryKey: computed(() => ['settings', 'audit', { ...auditFilters }]), queryFn: () => settingsService.audit(auditFilters) });

function detailsText(d: unknown) {
  if (d === null || d === undefined) return '';
  return typeof d === 'string' ? d : JSON.stringify(d);
}
</script>

<template>
  <PageHeader title="Configuración" description="Códigos de función, archivos de Asterisk, plantillas generadas y bitácora de cambios.">
    <Badge v-if="health.data.value" :variant="health.data.value.status === 'ok' ? 'outline' : 'destructive'" class="gap-1.5">
      API {{ health.data.value.status }} · BD {{ health.data.value.db ? 'ok' : 'error' }} · AMI {{ health.data.value.ami ? 'ok' : 'sin conexión' }}
    </Badge>
  </PageHeader>

  <Tabs v-model="section" class="gap-4">
    <TabsList>
      <TabsTrigger value="features">Códigos de función</TabsTrigger>
      <TabsTrigger value="files">Archivos de Asterisk</TabsTrigger>
      <TabsTrigger value="templates">Plantillas generadas</TabsTrigger>
      <TabsTrigger value="audit">Auditoría</TabsTrigger>
    </TabsList>

    <TabsContent value="features">
      <FeatureCodesCard @edit="openEditor" />
    </TabsContent>

    <TabsContent value="files">
      <ConfigFilesEditor :key="editorFile" :initial-file="editorFile" />
    </TabsContent>

    <TabsContent value="templates">
  <Card>
    <CardHeader>
      <CardTitle>Plantillas de configuración</CardTitle>
      <CardDescription>Generadas a partir de la configuración del servicio. Cópialas a <code>/etc/asterisk</code> (u <code>/etc</code> para odbc.ini) o pégalas en el editor de archivos.</CardDescription>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="config.isPending.value" class="h-64 w-full" />
      <EmptyState v-else-if="config.isError.value" title="No se pudo generar la configuración" :description="errorMessage(config.error.value)" />
      <Tabs v-else-if="config.data.value" v-model="activeFile">
        <TabsList class="flex-wrap">
          <TabsTrigger v-for="s in config.data.value.snippets" :key="s.file" :value="s.file" class="font-mono text-xs">{{ s.file }}</TabsTrigger>
        </TabsList>
        <TabsContent v-for="s in config.data.value.snippets" :key="s.file" :value="s.file" class="mt-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm text-muted-foreground">{{ s.description }}</p>
            <CopyButton :text="s.content" label="Copiar" />
          </div>
          <pre class="max-h-[50vh] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-200">{{ s.content }}</pre>
        </TabsContent>
        <p class="mt-3 text-xs text-muted-foreground">Generado: {{ formatDateTime(config.data.value.generatedAt) }}</p>
      </Tabs>
    </CardContent>
  </Card>

    </TabsContent>

    <TabsContent value="audit">
  <Card class="overflow-hidden">
    <CardHeader>
      <CardTitle>Auditoría</CardTitle>
      <CardDescription>Operaciones realizadas desde el servicio.</CardDescription>
    </CardHeader>
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Objeto</TableHead>
            <TableHead class="hidden lg:table-cell">Detalle</TableHead>
            <TableHead class="hidden md:table-cell">IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableSkeleton v-if="audit.isPending.value" :cols="6" />
          <TableRow v-else-if="!audit.data.value?.items.length"><TableCell colspan="6" class="p-0"><EmptyState title="Sin registros de auditoría" /></TableCell></TableRow>
          <TableRow v-for="a in audit.data.value?.items" :key="a.id">
            <TableCell class="text-xs whitespace-nowrap">{{ formatDateTime(a.createdAt) }}</TableCell>
            <TableCell class="font-mono text-xs">{{ a.username ?? '—' }}</TableCell>
            <TableCell><Badge variant="outline">{{ a.action }}</Badge></TableCell>
            <TableCell class="font-mono text-xs">{{ a.resource }}<span v-if="a.resourceId" class="text-muted-foreground">/{{ a.resourceId }}</span></TableCell>
            <TableCell class="hidden max-w-md truncate font-mono text-xs text-muted-foreground lg:table-cell">{{ detailsText(a.details) }}</TableCell>
            <TableCell class="hidden font-mono text-xs md:table-cell">{{ a.ip ?? '—' }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TablePagination v-model:page="auditFilters.page" v-model:page-size="auditFilters.pageSize" :total="audit.data.value?.total ?? 0" />
    </CardContent>
  </Card>
    </TabsContent>
  </Tabs>
</template>
