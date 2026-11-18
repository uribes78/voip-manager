import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  hasPermission as roleHasPermission,
  type LoginInput,
  type Permission,
  type TokenPair,
  type UserPublic,
} from '@voip-manager/shared';
import { api } from '@/lib/api';

const STORAGE_KEY = 'voip-manager.auth';

interface Persisted {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}

function load(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function persist(data: Persisted | null) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export const useAuthStore = defineStore('auth', () => {
  const initial = load();
  const accessToken = ref<string | null>(initial?.accessToken ?? null);
  const refreshToken = ref<string | null>(initial?.refreshToken ?? null);
  const user = ref<UserPublic | null>(initial?.user ?? null);

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  function apply(pair: TokenPair) {
    accessToken.value = pair.accessToken;
    refreshToken.value = pair.refreshToken;
    user.value = pair.user;
    persist({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: pair.user });
  }

  async function login(input: LoginInput) {
    const pair = await api.post<TokenPair>('/auth/login', input, { auth: false });
    apply(pair);
    return pair.user;
  }

  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false;
    try {
      const pair = await api.post<TokenPair>('/auth/refresh', { refreshToken: refreshToken.value }, { auth: false });
      apply(pair);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchMe() {
    if (!accessToken.value) return null;
    const me = await api.get<UserPublic>('/auth/me');
    user.value = me;
    if (accessToken.value && refreshToken.value) {
      persist({ accessToken: accessToken.value, refreshToken: refreshToken.value, user: me });
    }
    return me;
  }

  function logoutLocal() {
    accessToken.value = null;
    refreshToken.value = null;
    user.value = null;
    persist(null);
  }

  async function logout() {
    const token = refreshToken.value;
    try {
      if (token) await api.post('/auth/logout', { refreshToken: token });
    } catch {
      /* el logout local siempre procede */
    } finally {
      logoutLocal();
    }
  }

  function hasPermission(permission: Permission): boolean {
    return user.value ? roleHasPermission(user.value.role, permission) : false;
  }

  return {
    accessToken,
    refreshToken,
    user,
    isAuthenticated,
    isAdmin,
    login,
    refresh,
    fetchMe,
    logout,
    logoutLocal,
    hasPermission,
  };
});
