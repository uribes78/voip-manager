import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { Permission } from '@voip-manager/shared';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    permission?: Permission;
    title?: string;
    public?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { public: true, title: 'Iniciar sesión' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue'), meta: { permission: 'ami:read', title: 'Dashboard' } },
      { path: 'extensions', name: 'extensions', component: () => import('@/pages/extensions/ExtensionsPage.vue'), meta: { permission: 'extensions:read', title: 'Extensiones' } },
      { path: 'extensions/new', name: 'extension-new', component: () => import('@/pages/extensions/ExtensionFormPage.vue'), meta: { permission: 'extensions:write', title: 'Nueva extensión' } },
      { path: 'extensions/:id/edit', name: 'extension-edit', component: () => import('@/pages/extensions/ExtensionFormPage.vue'), props: true, meta: { permission: 'extensions:write', title: 'Editar extensión' } },
      { path: 'trunks', name: 'trunks', component: () => import('@/pages/trunks/TrunksPage.vue'), meta: { permission: 'trunks:read', title: 'Troncales' } },
      { path: 'trunks/new', name: 'trunk-new', component: () => import('@/pages/trunks/TrunkFormPage.vue'), meta: { permission: 'trunks:write', title: 'Nueva troncal' } },
      { path: 'trunks/:id/edit', name: 'trunk-edit', component: () => import('@/pages/trunks/TrunkFormPage.vue'), props: true, meta: { permission: 'trunks:write', title: 'Editar troncal' } },
      { path: 'queues', name: 'queues', component: () => import('@/pages/queues/QueuesPage.vue'), meta: { permission: 'queues:read', title: 'Colas' } },
      { path: 'queues/new', name: 'queue-new', component: () => import('@/pages/queues/QueueFormPage.vue'), meta: { permission: 'queues:write', title: 'Nueva cola' } },
      { path: 'queues/:name', name: 'queue-detail', component: () => import('@/pages/queues/QueueDetailPage.vue'), props: true, meta: { permission: 'queues:read', title: 'Detalle de cola' } },
      { path: 'queues/:name/edit', name: 'queue-edit', component: () => import('@/pages/queues/QueueFormPage.vue'), props: true, meta: { permission: 'queues:write', title: 'Editar cola' } },
      { path: 'dialplan', name: 'dialplan', component: () => import('@/pages/dialplan/DialplanPage.vue'), meta: { permission: 'dialplan:read', title: 'Plan de marcado' } },
      { path: 'moh', name: 'moh', component: () => import('@/pages/moh/MohPage.vue'), meta: { permission: 'moh:read', title: 'Música en espera' } },
      { path: 'cdr', name: 'cdr', component: () => import('@/pages/CdrPage.vue'), meta: { permission: 'cdr:read', title: 'CDR' } },
      { path: 'logs', name: 'logs', component: () => import('@/pages/LogsPage.vue'), meta: { permission: 'logs:read', title: 'Logs' } },
      { path: 'users', name: 'users', component: () => import('@/pages/users/UsersPage.vue'), meta: { permission: 'users:read', title: 'Usuarios' } },
      { path: 'settings', name: 'settings', component: () => import('@/pages/settings/SettingsPage.vue'), meta: { permission: 'settings:read', title: 'Configuración' } },
      { path: '403', name: 'forbidden', component: () => import('@/pages/ForbiddenPage.vue'), meta: { title: 'Sin permiso' } },
      { path: ':pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue'), meta: { title: 'No encontrado' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (to.name === 'login' && auth.isAuthenticated) return { name: 'dashboard' };
    return true;
  }
  if (!auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined };
  }
  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · VoIP Manager` : 'VoIP Manager';
});
