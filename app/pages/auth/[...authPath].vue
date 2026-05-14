<script lang="ts" setup>
import type { AuthResponse } from '#layers/thei/shared/api/auth-response';

if (useIsAdmin().value) {
  await navigateTo('/admin/');
}

const nuxtApp = useNuxtApp();
const route = useRoute();
const authSegment = (() => {
  const rawParam = route.params.authPath;

  if (!rawParam) {
    return '';
  }

  if (typeof rawParam === 'string') {
    return rawParam;
  }

  return rawParam.join('/');
})();

const publicAdmin = await usePublicAdmin();

const {
  auth_tab_title,
  auth_subtitle,
  auth_password_placeholder,
  auth_submit,
  auth_submitting,
} = useLanguagePhrases();

const language = useLanguage();

await useAdminTabTitle(auth_tab_title);

const password = ref('');
const submitting = ref(false);
const error = ref<string>();
const cooldown = ref(0);

const canSubmit = computed(() => {
  const hasPassword = password.value.trim() !== '';
  const notSubmitting = !submitting.value;
  const notInCooldown = cooldown.value === 0;
  return hasPassword && notSubmitting && notInCooldown;
});

let cooldownTimer: ReturnType<typeof setInterval> | undefined;

function startCooldown() {
  cooldown.value = 3;
  cooldownTimer = setInterval(() => {
    cooldown.value--;
    if (cooldown.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = undefined;
    }
  }, 1000);
}

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});

async function handleSubmit() {
  error.value = undefined;
  submitting.value = true;

  try {
    const response = await $fetch<AuthResponse>('/api/auth/' + authSegment, {
      method: 'POST',
      body: { password: password.value },
    });

    if (response.type === 'success') {
      useIsAdmin().value = true;
      await refreshNuxtData('public-admin');
      await navigateTo('/admin/');
      return;
    }

    error.value = language.value!.phrases[response.phraseId] as string;
    startCooldown();
  } catch (e: any) {
    error.value = e?.data?.message ?? e?.message ?? String(e);
    startCooldown();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AdminGridWrapper>
    <CenteredCard maxWidth="sm">
      <div class="w-full">
        <div class="flex flex-col place-items-center">
          <div class="flex items-center gap-10">
            <Icon
              name="thei"
              class="text-6xl text-gray-800 dark:text-gray-100"
            />
            <div
              class="rounded-full border-2 border-gray-600 dark:border-gray-100"
            >
              <Media
                :src="publicAdmin.avatarUrl"
                class="m-[2px] size-[58px] rounded-full"
              />
            </div>
          </div>
        </div>

        <div class="my-6 flex flex-col place-items-center gap-1">
          <h1
            class="text-2xl font-bold tracking-tight text-gray-900
              dark:text-gray-100"
          >
            {{ publicAdmin.displayName }}
          </h1>
          <p class="font-semibold text-gray-500 dark:text-gray-400">
            {{ auth_subtitle }}
          </p>
        </div>

        <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            autofocus
            autocomplete="current-password"
            :placeholder="auth_password_placeholder as string"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2
              text-sm text-gray-800 shadow-sm dark:border-gray-600
              dark:bg-gray-800 dark:text-gray-100 hactive:border-blue-500
              hactive:ring-1 hactive:ring-blue-500 hactive:outline-none"
          />

          <p
            v-if="error"
            class="rounded-lg border border-red-200 bg-red-50 px-4 py-3
              text-center text-sm text-red-700 dark:border-red-800
              dark:bg-red-900/20 dark:text-red-400"
          >
            {{ error }}
          </p>

          <AdminButton type="submit" :disabled="!canSubmit">
            <template v-if="submitting">{{ auth_submitting }}</template>
            <template v-else-if="cooldown > 0">
              {{ auth_submit }} ({{ cooldown }})
            </template>
            <template v-else>{{ auth_submit }}</template>
          </AdminButton>
        </form>
      </div>
    </CenteredCard>
  </AdminGridWrapper>
</template>
