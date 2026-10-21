<script lang="ts" setup>
import { FIELD_ASK_MAX } from '#layers/thei/shared/ai-field-ask';
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
  answered.value = undefined;
  await aiAttempt(async () => {
    const { sessionUuid } = await aiApi.ask({
      ref: props.target,
      place: `text:${props.textSlot}`,
      text,
      label: props.title,
    });
    asked.value = sessionUuid;
  }, sending);
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
  const answer = await askAnswer(sessionUuid);
  if (!answer || asked.value !== sessionUuid) return;
  const edits = answer.actions
    .filter((action) => action.kind === 'revise' && action.state === 'pending')
    .map((action) => action.actionUuid);
  asked.value = undefined;
  // What it found may wait already, from an earlier ask: that is opened.
  if (edits.length || props.waiting) {
    open.value = false;
    emit('proposed', edits);
    return;
  }
  answered.value = sessionUuid;
  said.value = answer.said;
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
      <AiAskState
        :asking="asking ? asked : undefined"
        :answered
        :said
        :nothing="phrase.ai_editor_ask_nothing"
        mark="editor-ai"
        @stop="stop"
      />
      <AiCommentBox
        v-if="!asking"
        :about="phrase.ai_editor_ask_about(publicText(title))"
        about-icon="sparkles"
        :quick
        :placeholder="phrase.ai_editor_ask_placeholder"
        :max="FIELD_ASK_MAX"
        @send="send"
      />
    </div>
  </FloatingPopup>
</template>
