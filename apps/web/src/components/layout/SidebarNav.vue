<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { Permission } from '@voip-manager/shared';
import {
  ActivityIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  MusicIcon,
  RadioIcon,
  PhoneCallIcon,
  PhoneForwardedIcon,
  SettingsIcon,
  UsersIcon,
  UsersRoundIcon,
} from '@lucide/vue';
import type { Component } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  to: string;
  label: string;
  icon: Component;
  permission: Permission;
  match?: string;
}

const props = defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ navigate: [] }>();
const auth = useAuthStore();
const route = useRoute();

const items: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, permission: 'ami:read', match: '/' },
  { to: '/monitor', label: 'Monitor', icon: RadioIcon, permission: 'monitor:read' },
  { to: '/extensions', label: 'Extensiones', icon: PhoneCallIcon, permission: 'extensions:read' },
  { to: '/trunks', label: 'Troncales', icon: PhoneForwardedIcon, permission: 'trunks:read' },
  { to: '/queues', label: 'Colas', icon: UsersRoundIcon, permission: 'queues:read' },
  { to: '/dialplan', label: 'Plan de marcado', icon: ListOrderedIcon, permission: 'dialplan:read' },
  { to: '/moh', label: 'Música en espera', icon: MusicIcon, permission: 'moh:read' },
  { to: '/cdr', label: 'CDR', icon: ActivityIcon, permission: 'cdr:read' },
  { to: '/logs', label: 'Logs', icon: FileTextIcon, permission: 'logs:read' },
  { to: '/users', label: 'Usuarios', icon: UsersIcon, permission: 'users:read' },
  { to: '/settings', label: 'Configuración', icon: SettingsIcon, permission: 'settings:read' },
];

const visible = computed(() => items.filter((i) => auth.hasPermission(i.permission)));

function isActive(item: NavItem) {
  if (item.match === '/') return route.path === '/';
  return route.path.startsWith(item.to);
}
</script>

<template>
  <nav class="flex flex-col gap-0.5 p-2">
    <template v-for="item in visible" :key="item.to">
      <Tooltip v-if="props.collapsed">
        <TooltipTrigger as-child>
          <RouterLink
            :to="item.to"
            class="flex h-8 items-center justify-center rounded-full text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            :class="isActive(item) && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium [&_svg]:text-primary'"
            @click="emit('navigate')"
          >
            <component :is="item.icon" class="size-4" />
          </RouterLink>
        </TooltipTrigger>
        <TooltipContent side="right">{{ item.label }}</TooltipContent>
      </Tooltip>
      <RouterLink
        v-else
        :to="item.to"
        class="flex h-8 items-center gap-2.5 rounded-full px-3 text-[13px] text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        :class="isActive(item) && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium [&_svg]:text-primary'"
        @click="emit('navigate')"
      >
        <component :is="item.icon" class="size-4 shrink-0" />
        <span class="truncate">{{ item.label }}</span>
      </RouterLink>
    </template>
  </nav>
</template>
