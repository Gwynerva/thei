<script lang="ts" setup>
import type { FieldOptions } from '#layers/thei/app/components/field/FieldOptions.vue';
import type {
  OAuthDecisionResponse,
  OAuthRequestView,
} from '#layers/thei/shared/oauth';
import {
  API_TOKEN_LABEL_MAX,
  type ApiTokenPreset,
} from '#layers/thei/shared/api-token';

/**
 * The owner's word on an AI app asking for a connection: who asks — known by
 * the address of its own description, or by its own word — where the browser
 * goes back to, and with what rights. The request is read once the page is in
 * the owner's browser: the session cookie does not come along on a redirect
 * from another site, but does on the page's own request.
 */
useHead({ meta: [{ name: 'robots', content: 'noindex,nofollow' }] });
await useAdminTabTitle(computed(() => phrase.value.oauth_consent));
const publicAdmin = await usePublicAdmin();
const route = useRoute();
const requestId = String(route.params.request ?? '');

const state = ref<'loading' | 'sign-in' | 'gone' | 'ready' | 'leaving'>(
  'loading',
);
const view = ref<OAuthRequestView>();
const preset = ref<ApiTokenPreset>('reader');
const label = ref('');
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    view.value = await $fetch<OAuthRequestView>(
      `/api/admin/oauth/requests/${requestId}`,
    );
    label.value = view.value.label;
    state.value = 'ready';
  } catch (caught) {
    const status = (caught as { statusCode?: number }).statusCode;
    state.value = status === 403 ? 'sign-in' : 'gone';
  }
});

const signInPath = computed(
  () => `/sign-in/?next=${encodeURIComponent(`/oauth/consent/${requestId}/`)}`,
);
const siteName = computed(() => publicText(publicAdmin.value.displayName));

const presetOptions = computed<FieldOptions>(() => ({
  reader: {
    icon: 'visibility',
    title: phrase.value.api_token_preset_reader,
    description: phrase.value.api_token_preset_reader_hint,
  },
  editor: {
    icon: 'edit',
    title: phrase.value.api_token_preset_editor,
    description: phrase.value.api_token_preset_editor_hint,
  },
}));

async function decide(allow: boolean) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const answer = await $fetch<OAuthDecisionResponse>(
      `/api/admin/oauth/requests/${requestId}`,
      {
        method: 'POST',
        body: { allow, preset: preset.value, label: label.value },
      },
    );
    state.value = 'leaving';
    window.location.href = answer.redirect;
  } catch (caught) {
    const status = (caught as { statusCode?: number }).statusCode;
    if (status === 404) state.value = 'gone';
    else error.value = errorMessage(caught, phrase.value.error_title);
    busy.value = false;
  }
}
</script>

<template>
  <AdminGridWrapper>
    <div class="flex min-h-screen items-center justify-center">
      <section
        class="flex min-h-screen w-full max-w-120 flex-col justify-center gap-md
          border-border-1 bg-bg-2 p-md shadow-lg shadow-shadow-1 sm:min-h-auto
          sm:rounded-normal sm:border"
        data-oauth-consent
        :data-state="state"
      >
        <div class="flex items-center gap-sm">
          <div
            class="size-12 shrink-0 overflow-clip rounded-full ring-2
              ring-border-3 ring-offset-2 ring-offset-bg-2"
          >
            <Media v-bind="publicAdmin.avatarMedia" class="size-full" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-lg font-bold">{{ siteName }}</div>
            <div class="text-sm text-text-3">{{ phrase.oauth_consent }}</div>
          </div>
        </div>

        <p v-if="state === 'loading'" class="text-text-3">
          <Icon name="loading" />
        </p>

        <template v-else-if="state === 'sign-in'">
          <p class="text-text-2">{{ phrase.oauth_sign_in_needed }}</p>
          <!-- A link drawn as the main `Button` is, as tall as the page's. -->
          <TheiLink
            :to="signInPath"
            class="flex h-10 items-center justify-center gap-xs rounded-normal
              bg-accent/80 px-sm text-sm font-semibold whitespace-nowrap
              text-white transition-colors hocus:bg-accent"
          >
            <Icon name="key" />{{ phrase.sign_in }}
          </TheiLink>
        </template>

        <p v-else-if="state === 'gone'" class="text-text-2">
          {{ phrase.oauth_gone }}
        </p>

        <p v-else-if="state === 'leaving'" class="text-text-2">
          <Icon name="loading" class="mr-xs" />{{ phrase.oauth_returning }}
        </p>

        <template v-else-if="view">
          <h1 class="text-xl font-bold wrap-break-word">
            {{ phrase.oauth_consent_title(view.client.name, siteName) }}
          </h1>

          <ul class="flex flex-col gap-xs text-sm">
            <li
              v-if="view.client.kind === 'cimd'"
              class="flex items-start gap-xs text-text-2"
            >
              <Icon name="check" class="mt-0.5 shrink-0 text-text-success" />
              <span class="min-w-0 wrap-break-word">{{
                phrase.oauth_verified(view.client.host)
              }}</span>
            </li>
            <li v-else class="flex items-start gap-xs text-text-warning">
              <Icon name="warning" class="mt-0.5 shrink-0" />
              <span class="min-w-0 wrap-break-word">{{
                phrase.oauth_unverified
              }}</span>
            </li>
            <li
              class="flex items-start gap-xs"
              :class="
                view.redirect.kind === 'loopback' ||
                (view.redirect.kind === 'web' && !view.redirect.matchesClient)
                  ? 'text-text-warning'
                  : 'text-text-2'
              "
            >
              <Icon
                :name="view.redirect.kind === 'loopback' ? 'warning' : 'link'"
                class="mt-0.5 shrink-0"
              />
              <span class="min-w-0 wrap-break-word">{{
                view.redirect.kind === 'loopback'
                  ? phrase.oauth_redirect_loopback(view.redirect.port ?? '')
                  : view.redirect.kind === 'app'
                    ? phrase.oauth_redirect_app(view.redirect.host)
                    : view.redirect.matchesClient
                      ? phrase.oauth_redirect_web(view.redirect.host)
                      : phrase.oauth_redirect_elsewhere(view.redirect.host)
              }}</span>
            </li>
            <li
              v-if="view.connections"
              class="flex items-start gap-xs text-text-2"
            >
              <Icon name="person-key" class="mt-0.5 shrink-0" />
              <span>{{ phrase.oauth_connections(view.connections) }}</span>
            </li>
          </ul>

          <Field>
            <FieldLabel>{{ phrase.oauth_rights }}</FieldLabel>
            <FieldOptions
              v-model="preset"
              :options="presetOptions"
              direction="column"
            />
            <FieldHint v-if="view.requested.includes('edit')">{{
              phrase.oauth_requested_edit
            }}</FieldHint>
          </Field>
          <Field>
            <FieldLabel>{{ phrase.api_token_label }}</FieldLabel>
            <FieldInput
              v-model="label"
              autocomplete="off"
              :maxlength="API_TOKEN_LABEL_MAX"
            />
          </Field>

          <p v-if="view.limitReached" class="text-sm text-text-warning">
            <Icon name="warning" class="mr-xs" />{{ phrase.api_token_too_many }}
          </p>
          <p v-if="error" class="text-sm text-text-error">
            <Icon name="warning" class="mr-xs" />{{ error }}
          </p>
          <div class="flex flex-wrap justify-end gap-xs">
            <Button
              variant="secondary"
              class="flex h-10 items-center gap-xs whitespace-nowrap"
              :disabled="busy"
              data-oauth-deny
              @click="decide(false)"
            >
              {{ phrase.oauth_deny }}
            </Button>
            <Button
              class="flex h-10 items-center gap-xs font-semibold
                whitespace-nowrap"
              :disabled="busy || view.limitReached"
              data-oauth-allow
              @click="decide(true)"
            >
              <Icon v-if="busy" name="loading" />{{ phrase.oauth_allow }}
            </Button>
          </div>
        </template>
      </section>
    </div>
  </AdminGridWrapper>
</template>
