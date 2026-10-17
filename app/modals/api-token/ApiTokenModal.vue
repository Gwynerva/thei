<script setup lang="ts">
import type { AiCheckReport } from '#layers/thei/shared/ai-check';
import {
  apiTokenPresetOf,
  type ApiTokenActivityResponse,
  type ApiTokenItem,
} from '#layers/thei/shared/api-token';
import ModalContainer from '../ModalContainer.vue';
import ModalHeaderButton from '../ModalHeaderButton.vue';
import ModalTitle from '../ModalTitle.vue';
import ModalWaiting from '../ModalWaiting.vue';

/**
 * One access key: what it may do, when it was made and last used, and its
 * latest sessions, with how many of the actions it proposed still wait for
 * the owner. From here it is checked, as an app holding it connects, or
 * revoked. The header is the key's name and its revoke; what the key is
 * opens the body, with the check.
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
    <!-- One slim row: the key, as its shell names it, and its two buttons. -->
    <template #header>
      <div class="flex items-center gap-sm p-sm">
        <ModalTitle
          icon="key"
          :title="publicText(token.label)"
          class="flex-1"
        />
        <div class="flex items-center gap-xs">
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
          />
        </div>
      </div>
    </template>
    <div class="flex flex-col gap-md p-sm sm:p-md">
      <!-- What the key is: its rights, its last use, the app it came from;
           and, while AI is on, a check of it as an app would connect. -->
      <div class="flex flex-col gap-xs text-sm">
        <p class="flex items-center gap-xs font-semibold">
          <Icon
            :name="preset ? PRESET_ICONS[preset] : 'key'"
            class="shrink-0 text-text-3"
          />{{ rights }}
        </p>
        <p class="text-xs wrap-break-word text-text-3">
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
        <Button
          v-if="aiEnabled"
          variant="secondary"
          class="mt-xs flex h-9 shrink-0 items-center gap-xs self-start
            whitespace-nowrap pointer-coarse:h-11"
          :disabled="Boolean(busy)"
          data-api-token-check
          @click="check"
        >
          <Icon :name="busy === 'check' ? 'loading' : 'pulse'" />{{
            phrase.ai_check
          }}
        </Button>
      </div>
      <p v-if="error" class="text-sm text-text-error">
        <Icon name="warning" class="mr-xs" />{{ error }}
      </p>
      <AiCheckSteps v-if="report" :report />

      <section class="flex flex-col gap-xs">
        <h3 class="text-sm font-semibold text-text-2">
          {{ phrase.api_token_history }}
        </h3>
        <ModalWaiting v-if="!activity && !error" class="h-16" />
        <template v-else-if="activity">
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
