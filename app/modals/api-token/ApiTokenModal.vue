<script setup lang="ts">
import type { AiCheckReport } from '#layers/thei/shared/ai-check';
import {
  apiTokenPresetOf,
  type ApiTokenActivityResponse,
  type ApiTokenItem,
} from '#layers/thei/shared/api-token';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';

/**
 * One access key: what it may do, when it was made and last used, and its
 * latest sessions, with how many of the actions it proposed still wait for
 * the owner. From here it is checked, as an app holding it connects, or
 * revoked.
 */
const { modalData } = defineProps<{
  modalData: { token: ApiTokenItem };
}>();
const emit = defineEmits<{ modalResult: [{ type: 'revoked' }] }>();

const token = modalData.token;
const activity = ref<ApiTokenActivityResponse>();
const report = ref<AiCheckReport>();
const busy = ref<'check' | 'revoke'>();
const error = ref('');

onMounted(async () => {
  try {
    activity.value = await $fetch<ApiTokenActivityResponse>(
      `/api/admin/api-tokens/${token.tokenUuid}`,
    );
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
  }
});

const preset = apiTokenPresetOf(token.scopes);
const PRESET_ICONS = { reader: 'visibility', editor: 'edit' } as const;
const rights = computed(() =>
  preset === 'reader'
    ? phrase.value.api_token_preset_reader
    : preset === 'editor'
      ? phrase.value.api_token_preset_editor
      : phrase.value.api_token_preset_custom,
);

/** A key is tried only while AI is on: off, it opens nothing. */
const aiEnabled = useAiEnabled();

async function check() {
  if (busy.value) return;
  busy.value = 'check';
  error.value = '';
  try {
    report.value = await $fetch<AiCheckReport>('/api/admin/ai/check', {
      method: 'POST',
      body: { token: token.tokenUuid },
    });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
  } finally {
    busy.value = undefined;
  }
}

async function revoke() {
  if (busy.value) return;
  if (
    !window.confirm(
      phrase.value.api_token_revoke_confirm(publicText(token.label)),
    )
  )
    return;
  busy.value = 'revoke';
  error.value = '';
  try {
    await $fetch(`/api/admin/api-tokens/${token.tokenUuid}`, {
      method: 'DELETE',
    });
    emit('modalResult', { type: 'revoked' });
  } catch (caught) {
    error.value = errorMessage(caught, phrase.value.error_title);
    busy.value = undefined;
  }
}
</script>

<template>
  <ModalContainer class="max-w-140" data-api-token-modal>
    <template #header
      ><div class="flex items-start gap-xs p-sm">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5 px-xs pt-1">
          <h2 class="flex min-w-0 items-center gap-xs text-lg font-bold">
            <Icon
              :name="preset ? PRESET_ICONS[preset] : 'key'"
              class="shrink-0 text-text-3"
              :aria-label="rights"
            />
            <span class="truncate">{{ publicText(token.label) }}</span>
          </h2>
          <p class="text-xs wrap-break-word text-text-3">
            {{ rights }} ·
            <template v-if="token.lastUsedAt">
              {{ phrase.api_token_last_used }}
              <TheiTime :datetime="token.lastUsedAt" />
              <template v-if="token.lastClient">
                · {{ phrase.api_token_last_client(token.lastClient) }}
              </template>
            </template>
            <template v-else>{{ phrase.api_token_never_used }}</template>
          </p>
          <p
            v-if="token.client"
            class="flex items-center gap-1 text-xs wrap-break-word"
            :class="token.client.verified ? 'text-text-3' : 'text-text-warning'"
          >
            <Icon
              :name="token.client.verified ? 'check' : 'warning'"
              class="shrink-0"
            />{{
              token.client.verified
                ? phrase.api_token_signed_in_verified(
                    token.client.name,
                    token.client.host,
                  )
                : phrase.api_token_signed_in_unverified(token.client.name)
            }}
          </p>
        </div>
        <ModalHeaderButton
          v-if="aiEnabled"
          :icon="busy === 'check' ? 'loading' : 'pulse'"
          :label="phrase.ai_check"
          :disabled="Boolean(busy)"
          data-api-token-check
          @click="check"
        />
        <ModalHeaderButton
          icon="delete"
          variant="delete"
          :label="phrase.api_token_revoke"
          :disabled="Boolean(busy)"
          data-api-token-revoke
          @click="revoke"
        />
        <ModalHeaderButton
          icon="close"
          :label="phrase.close_modal"
          @click="closeModal"
        /></div
    ></template>
    <div class="flex flex-col gap-md p-sm sm:p-md">
      <p v-if="error" class="text-sm text-text-error">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
      <AiCheckSteps v-if="report" :report />

      <section class="flex flex-col gap-xs">
        <h3 class="text-sm font-semibold text-text-2">
          {{ phrase.api_token_history }}
        </h3>
        <p v-if="!activity" class="text-sm text-text-3">
          <Icon name="loading" />
        </p>
        <template v-else>
          <TheiLink
            v-if="activity.waiting > 0"
            to="/admin/ai/"
            class="flex items-center gap-xs text-sm font-semibold text-accent
              hocus:underline"
            data-api-token-waiting
            @click="closeModal"
          >
            <Icon name="sparkles" />{{
              phrase.ai_session_waiting(activity.waiting)
            }}
          </TheiLink>
          <p
            v-if="!activity.sessions.length"
            class="text-sm text-text-3 italic"
          >
            {{ phrase.api_token_history_empty }}
          </p>
          <div v-else class="-mx-2 flex flex-col" data-api-token-sessions>
            <AiSessionLink
              v-for="session in activity.sessions"
              :key="session.sessionUuid"
              :item="session"
              @click="closeModal"
            />
          </div>
        </template>
      </section>
    </div>
  </ModalContainer>
</template>
