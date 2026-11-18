<script setup lang="ts">
import { CompassIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState.vue';
</script>

<template>
  <EmptyState title="Página no encontrada" description="La ruta solicitada no existe o fue movida.">
    <template #icon><CompassIcon class="size-6" /></template>
    <Button as-child variant="outline"><RouterLink to="/">Ir al dashboard</RouterLink></Button>
  </EmptyState>
</template>
