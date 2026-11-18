<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { PhoneIcon } from '@lucide/vue';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import SidebarNav from '@/components/layout/SidebarNav.vue';
import TopBar from '@/components/layout/TopBar.vue';
import { useEvents } from '@/composables/useEvents';
import { useAuthStore } from '@/stores/auth';

const collapsed = useLocalStorage('voip-manager.sidebar-collapsed', false);
const mobileOpen = ref(false);
const auth = useAuthStore();

useEvents();

onMounted(() => {
  // Refresca el perfil por si cambió el rol; si el token ya no sirve, el cliente redirige al login.
  auth.fetchMe().catch(() => undefined);
});
</script>

<template>
  <div class="flex min-h-full bg-background">
    <aside
      class="hidden shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex"
      :class="collapsed ? 'w-14' : 'w-56'"
    >
      <div class="flex h-13 items-center gap-2.5 px-3">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
          <PhoneIcon class="size-4" />
        </div>
        <div v-if="!collapsed" class="min-w-0 leading-tight">
          <p class="truncate text-[13px] font-semibold tracking-tight">VoIP Manager</p>
          <p class="truncate text-[11px] text-muted-foreground">Asterisk Realtime</p>
        </div>
      </div>
      <SidebarNav :collapsed="collapsed" />
    </aside>

    <Sheet v-model:open="mobileOpen">
      <SheetContent side="left" class="w-64 p-0">
        <SheetHeader class="h-14 justify-center border-b px-4">
          <SheetTitle class="text-sm">VoIP Manager</SheetTitle>
        </SheetHeader>
        <SidebarNav :collapsed="false" @navigate="mobileOpen = false" />
      </SheetContent>
    </Sheet>

    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar @toggle-sidebar="collapsed = !collapsed" @open-mobile="mobileOpen = true" />
      <main class="flex-1 px-4 py-5 sm:px-6">
        <div class="mx-auto w-full max-w-7xl">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>
