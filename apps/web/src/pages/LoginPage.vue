<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { LoaderCircleIcon, PhoneIcon } from '@lucide/vue';
import { LoginInput } from '@voip-manager/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormText } from '@/components/common/form';
import { toTypedSchema } from '@/lib/zod-schema';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const error = ref<string | null>(null);
const loading = ref(false);

const form = useForm({ validationSchema: toTypedSchema(LoginInput) });

const submit = form.handleSubmit(async (values) => {
  error.value = null;
  loading.value = true;
  try {
    await auth.login(values);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) error.value = 'Usuario o contraseña incorrectos.';
    else if (e instanceof ApiError && e.status === 403) error.value = 'Tu dirección IP no está autorizada o el usuario está inactivo.';
    else if (e instanceof TypeError) error.value = 'No se pudo contactar al servidor.';
    else error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-background px-4 py-10">
    <Card class="w-full max-w-sm">
      <CardHeader class="items-center text-center">
        <div class="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
          <PhoneIcon class="size-5" />
        </div>
        <CardTitle class="text-lg">VoIP Manager</CardTitle>
        <CardDescription>Inicia sesión para administrar Asterisk</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" novalidate @submit="submit">
          <FormText name="username" label="Usuario" autocomplete="username" placeholder="admin" />
          <FormText name="password" label="Contraseña" type="password" autocomplete="current-password" />
          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
          <Button type="submit" class="w-full" :disabled="loading">
            <LoaderCircleIcon v-if="loading" class="animate-spin" />
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
