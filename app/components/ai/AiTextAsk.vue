<script lang="ts" setup>
import type { AiSessionDetail } from '#layers/thei/shared/ai';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';

/**
 * The ✦ of a text's editor: the owner asks about the text in hand — check
 * it for mistakes, mend its links, put it in order — and a session answers
 * in the background, as at a field's ✦. What it proposes for this text is
 * handed to the editor (`proposed`), which opens it on its comparison at
 * once — or what waits for it already, when that is what it found; an
 * answer with nothing to change says so here, with the model's words. Its
 * count is what already waits for this text.
 */
const props = defineProps<{
  /** The entity whose text it is, by ref. */
  target: string;
  /** The text, as its entity names its slot. */
  textSlot: string;
  /** The text's name, as the editor's title says it. */
  title: string;
  waiting: number;
  /** The text holds anything: what mends it is offered only then. */
  filled: boolean;
}>();
const emit = defineEmits<{ proposed: [actionUuids: string[]] }>();

const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger');
const button = computed(() => trigger.value?.$el ?? null);
const open = ref(false);

/** The session asked, followed until it has answered. */
const asked = ref<string>();
/** Its ready requests: checking and mending only a text with something in it. */
const quick = computed(() => [
  ...phrase.value.ai_field_ask_quick.text,
  ...(props.filled ? (phrase.value.ai_field_ask_quick_filled.text ?? []) : []),
]);
const followed = useAiSession(asked);
const asking = computed(
  () =>
    Boolean(asked.value) &&
    (followed.detail.value?.session.state ?? 'running') === 'running',
);
/** The session that answered with nothing to change, and its last words. */
const answered = ref<string>();
const said = ref('');
const sending = ref(false);

async function send(text: string) {
  if (sending.value || !text.trim()) return;
  sending.value = true;
  answered.value = undefined;
  try {
    const { sessionUuid } = await $fetch<{ sessionUuid: string }>(
      '/api/admin/ai/ask',
      {
        method: 'POST',
        body: {
          ref: props.target,
          place: `text:${props.textSlot}`,
          text,
          label: props.title,
        },
      },
    );
    asked.value = sessionUuid;
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    sending.value = false;
  }
}

async function stop() {
  if (!asked.value) return;
  await aiApi.stop(asked.value).catch(() => undefined);
}

/**
 * Answered: its text edits go to the editor, or its words stay here. Read
 * afresh: the stream may tell the session stopped before what it proposed.
 */
let settling = false;
async function settle(sessionUuid: string) {
  const detail = await $fetch<AiSessionDetail>(
    `/api/admin/ai/sessions/${sessionUuid}`,
  ).catch(() => null);
  if (!detail || asked.value !== sessionUuid) return;
  const edits = detail.actions
    .filter((action) => action.kind === 'revise' && action.state === 'pending')
    .map((action) => action.actionUuid);
  asked.value = undefined;
  // What it found may wait already, from an earlier ask: that is opened.
  if (edits.length || props.waiting) {
    open.value = false;
    emit('proposed', edits);
    return;
  }
  answered.value = detail.session.sessionUuid;
  const last = detail.messages
    .filter((message) => message.role === 'model' && message.text.trim())
    .at(-1);
  said.value = last ? plainWords(last.text, 280) : '';
}
watch(
  () => followed.detail.value,
  (detail) => {
    if (
      detail &&
      asked.value === detail.session.sessionUuid &&
      detail.session.state !== 'running' &&
      !settling
    ) {
      settling = true;
      void settle(detail.session.sessionUuid).finally(() => (settling = false));
    }
  },
);
</script>

<template>
  <span class="relative inline-flex">
    <ModalHeaderButton
      ref="trigger"
      :icon="asking ? 'loading' : 'sparkles'"
      icon-class="text-accent"
      :label="phrase.ai_editor_ask"
      :data-title-popup="phrase.ai_editor_ask"
      aria-haspopup="dialog"
      :aria-expanded="open"
      data-editor-ai
      @click="open = !open"
    />
    <AiCount
      v-if="waiting"
      :count="waiting"
      class="pointer-events-none absolute -top-1 -right-1"
      data-editor-ai-count
    />
  </span>
  <FloatingPopup
    v-model:open="open"
    :anchor="button"
    placement="bottom-end"
    max-width="24rem"
    density="compact"
    complex
  >
    <div class="flex flex-col gap-1.5" data-editor-ai-ask>
      <div
        v-if="asking"
        class="flex min-h-9 items-center gap-xs rounded-sm border
          border-border-1 bg-bg-1 py-0.5 pr-0.5 pl-2.5 text-sm"
        data-editor-ai-asking
      >
        <AiRunningDots />
        <span class="min-w-0 flex-1">{{ phrase.ai_field_asking }}</span>
        <TheiLink
          :to="{ path: '/admin/ai/', query: { session: asked } }"
          class="shrink-0 text-xs text-text-2 underline decoration-text-2/35
            underline-offset-2 hocus:text-accent"
          >{{ phrase.ai_field_ask_open }}</TheiLink
        >
        <AiStopButton data-editor-ai-stop @click="stop" />
      </div>
      <template v-else>
        <div
          v-if="answered"
          class="flex flex-col gap-1 px-1 text-xs text-text-2"
          data-editor-ai-answered
        >
          <p class="flex items-center gap-1">
            <Icon name="ai-chat" class="shrink-0" />
            <span class="min-w-0 flex-1">{{
              phrase.ai_editor_ask_nothing
            }}</span>
            <TheiLink
              :to="{ path: '/admin/ai/', query: { session: answered } }"
              class="-my-3 inline-flex shrink-0 items-center py-3 underline
                decoration-text-2/35 underline-offset-2 hocus:text-accent"
              >{{ phrase.ai_field_ask_open }}</TheiLink
            >
          </p>
          <p
            v-if="said"
            class="line-clamp-4 border-l-2 border-border-2 pl-2 text-sm
              text-text-1"
          >
            {{ said }}
          </p>
        </div>
        <AiCommentBox
          :about="phrase.ai_editor_ask_about(title)"
          about-icon="sparkles"
          :quick
          :placeholder="phrase.ai_editor_ask_placeholder"
          @send="send"
        />
      </template>
    </div>
  </FloatingPopup>
</template>
