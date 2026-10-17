<script lang="ts" setup>
import type { OAuthRefusal } from '#layers/thei/shared/oauth';

/**
 * Where a request for a connection ends when the app asking could not be
 * trusted with an answer: an unknown app, an unreadable description, an
 * address that is not the app's own. Nothing went back to the app.
 */
useHead({ meta: [{ name: 'robots', content: 'noindex,nofollow' }] });
await useAdminTabTitle(computed(() => phrase.value.oauth_consent));
const publicAdmin = await usePublicAdmin();

const REASONS: OAuthRefusal[] = [
  'client',
  'client_document',
  'redirect_uri',
  'request',
];
const reason = computed<OAuthRefusal>(() => {
  const given = useRoute().query.reason;
  return REASONS.includes(given as OAuthRefusal)
    ? (given as OAuthRefusal)
    : 'request';
});
</script>

<template>
  <AdminGridWrapper>
    <div class="flex min-h-screen items-center justify-center">
      <section
        class="flex min-h-screen w-full max-w-120 flex-col justify-center gap-md
          border-border-1 bg-bg-2 p-md shadow-lg shadow-shadow-1 sm:min-h-auto
          sm:rounded-normal sm:border"
        data-oauth-refused
        :data-reason="reason"
      >
        <div class="truncate text-lg font-bold">
          {{ publicText(publicAdmin.displayName) }}
        </div>
        <h1 class="flex items-start gap-xs text-xl font-bold">
          <Icon name="warning" class="mt-1 shrink-0 text-text-warning" />{{
            phrase.oauth_refused_title
          }}
        </h1>
        <p class="text-text-2">{{ phrase.oauth_refused[reason] }}</p>
        <p class="text-sm text-text-3">{{ phrase.oauth_restart }}</p>
      </section>
    </div>
  </AdminGridWrapper>
</template>
