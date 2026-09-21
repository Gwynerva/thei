<script lang="ts" setup>
/**
 * The page a one-time sign-in link opens.
 *
 * It only asks. The link is spent by the button, never by opening the page,
 * because chat apps fetch an address as soon as it is pasted and would
 * otherwise use the link up before the person ever saw it.
 */
if (useIsAdmin().value) {
  await navigateTo('/admin/');
}

const route = useRoute();
const token = computed(() => String(route.params.token ?? ''));
await useAdminTabTitle(computed(() => phrase.value.sign_in));
useHead({ meta: [{ name: 'robots', content: 'noindex,nofollow' }] });
const publicAdmin = await usePublicAdmin();

const error = ref('');
const signingIn = ref(false);

async function signIn() {
  if (signingIn.value) return;
  error.value = '';
  signingIn.value = true;
  try {
    const response = await $fetch('/api/admin/session/link', {
      method: 'POST',
      body: { token: token.value },
    });
    if (response.type === 'error') throw new Error(response.message);
    window.location.href = sitePath('/admin/');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    signingIn.value = false;
  }
}
</script>

<template>
  <AdminGridWrapper>
    <div class="flex min-h-screen min-w-screen items-center justify-center">
      <section
        class="flex min-h-screen w-full max-w-95 min-w-screen flex-col
          justify-center gap-md rounded-normal border border-border-1 bg-bg-2
          p-md shadow-lg shadow-shadow-1 sm:min-h-auto sm:min-w-auto"
      >
        <div class="flex items-center justify-around">
          <div
            class="size-16 overflow-clip rounded-full ring-2 ring-border-3
              ring-offset-2 ring-offset-bg-2"
          >
            <Media
              v-bind="publicAdmin.avatarMedia"
              playback="autoplay"
              autoplay-reduced-motion
              loop
              muted
              class="size-full"
            />
          </div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold">{{ publicAdmin.displayName }}</div>
          <div class="text-text-2">{{ phrase.sign_in_link_confirm }}</div>
        </div>
        <p class="text-center text-sm text-text-3">
          {{ phrase.sign_in_link_confirm_hint }}
        </p>
        <Button
          class="text-lg font-semibold"
          :disabled="signingIn"
          @click="signIn"
        >
          <template v-if="signingIn">
            <Icon name="loading" class="mr-xs" />
            <span>{{ phrase.signing_in }}</span>
          </template>
          <template v-else>{{ phrase.sign_in }}</template>
        </Button>
        <div
          v-if="error"
          class="rounded-normal border border-border-error bg-bg-error p-xs
            text-xs text-text-error"
        >
          <Icon name="warning" class="mr-xs" />
          <span>{{ error }}</span>
        </div>
        <TheiLink
          to="/sign-in/"
          class="text-center text-sm text-text-3 underline-offset-2
            hocus:underline"
        >
          {{ phrase.sign_in }}
        </TheiLink>
      </section>
    </div>
  </AdminGridWrapper>
</template>
