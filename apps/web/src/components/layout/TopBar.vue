<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMutation } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { LogOutIcon, MenuIcon, MoonIcon, PanelLeftIcon, RefreshCwIcon, SunIcon, UserIcon, WifiIcon, WifiOffIcon } from '@lucide/vue';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth';
import { useRealtimeStore } from '@/stores/realtime';
import { useTheme } from '@/composables/useTheme';
import { amiService } from '@/services';
import { errorMessage } from '@/lib/api';
import ChangePasswordDialog from './ChangePasswordDialog.vue';

const emit = defineEmits<{ toggleSidebar: []; openMobile: [] }>();
const auth = useAuthStore();
const realtime = useRealtimeStore();
const router = useRouter();
const { isDark, toggleDark } = useTheme();
const passwordOpen = ref(false);

const initials = computed(() => {
  const name = auth.user?.fullName ?? auth.user?.username ?? '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});

const roleLabel: Record<string, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Lectura' };

const reload = useMutation({
  mutationFn: () => amiService.reload({ module: 'pjsip' }),
  onSuccess: (r) => (r.ok ? toast.success('PJSIP recargado', { description: r.response }) : toast.error('Recarga fallida', { description: r.response })),
  onError: (e) => toast.error('No se pudo recargar PJSIP', { description: errorMessage(e) }),
});

async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <header class="sticky top-0 z-20 flex h-13 items-center gap-1.5 border-b border-border/60 bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-4">
    <Button variant="ghost" size="icon" class="md:hidden" aria-label="Abrir menú" @click="emit('openMobile')"><MenuIcon /></Button>
    <Button variant="ghost" size="icon" class="hidden md:inline-flex" aria-label="Contraer menú" @click="emit('toggleSidebar')"><PanelLeftIcon /></Button>

    <div class="flex-1" />

    <Tooltip>
      <TooltipTrigger as-child>
        <div class="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium" :class="realtime.ami?.connected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'">
          <component :is="realtime.ami?.connected ? WifiIcon : WifiOffIcon" class="size-3.5" />
          <span class="hidden sm:inline">AMI {{ realtime.ami?.connected ? 'conectado' : 'desconectado' }}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Eventos: {{ realtime.wsState === 'connected' ? 'en vivo' : realtime.wsState === 'connecting' ? 'conectando…' : 'sin conexión' }}
        <span v-if="realtime.ami?.asteriskVersion"> · Asterisk {{ realtime.ami.asteriskVersion }}</span>
      </TooltipContent>
    </Tooltip>

    <Tooltip v-if="auth.hasPermission('ami:execute')">
      <TooltipTrigger as-child>
        <Button variant="outline" size="sm" :disabled="reload.isPending.value" @click="reload.mutate()">
          <RefreshCwIcon :class="reload.isPending.value && 'animate-spin'" />
          <span class="hidden sm:inline">Recargar PJSIP</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Ejecuta <code>module reload res_pjsip.so</code> vía AMI</TooltipContent>
    </Tooltip>

    <Button variant="ghost" size="icon" :aria-label="isDark ? 'Modo claro' : 'Modo oscuro'" @click="toggleDark()">
      <SunIcon v-if="isDark" />
      <MoonIcon v-else />
    </Button>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" class="gap-2 px-1.5">
          <Avatar size="sm"><AvatarFallback>{{ initials }}</AvatarFallback></Avatar>
          <span class="hidden text-sm sm:inline">{{ auth.user?.fullName ?? auth.user?.username }}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuLabel>
          <p class="text-sm font-medium">{{ auth.user?.fullName }}</p>
          <p class="text-xs text-muted-foreground">@{{ auth.user?.username }} · {{ roleLabel[auth.user?.role ?? ''] ?? auth.user?.role }}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="passwordOpen = true"><UserIcon /> Cambiar contraseña</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="logout"><LogOutIcon /> Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <ChangePasswordDialog v-model:open="passwordOpen" />
  </header>
</template>
