<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/composables/useTheme';

const { isDark } = useTheme();
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <RouterView />
  </TooltipProvider>
  <Toaster rich-colors close-button position="top-right" :theme="isDark ? 'dark' : 'light'" />
</template>
