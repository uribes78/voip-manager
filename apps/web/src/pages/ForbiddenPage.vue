<script setup lang="ts">
import { ShieldOffIcon } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState.vue';
</script>

<template>
  <EmptyState title="Sin permiso" description="Tu rol no tiene acceso a esta sección. Contacta a un administrador si necesitas acceso.">
    <template #icon><ShieldOffIcon class="size-6" /></template>
    <Button as-child variant="outline"><RouterLink to="/">Ir al dashboard</RouterLink></Button>
  </EmptyState>
</template>
