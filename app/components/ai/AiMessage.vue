<script lang="ts" setup>
import type {
  AiActionItem,
  AiMessageItem,
  AiMessagePart,
  AiStep,
} from '#layers/thei/shared/ai';
import { messageBody } from '#layers/thei/shared/ai-message-text';
import { placeField } from '#layers/thei/shared/ai-field-ask';

/**
 * One message of a session. The owner's is a bubble on the right — what it
 * answers or comments on above it. The model's reads as a text of the
 * archive, links to entities and to other sites included; under it, what it
 * did on the way in one quiet line, the actions it proposed as cards, its
 * question, and a notice when the turn ended early.
 */
const props = defineProps<{
  message: AiMessageItem;
  actions: AiActionItem[];
  /** The model is still writing it. */
  writing?: boolean;
  /** The question may be answered: the session takes messages. */
  answerable?: boolean;
  /** Any action of the session, by id: what a comment is about. */
  actionOf?: (actionUuid: string) => AiActionItem | undefined;
  /** The session's last message, with no turn running: a check may go on. */
  last?: boolean;
}>();
const emit = defineEmits<{
  answer: [question: string, text: string];
}>();

const linkResolver = useContentLinkResolver('admin');
const now = useLiveNow();

/** When the owner sent it, said relatively while it is recent. */
const sent = computed(() => sentWhen(props.message.createdAt, now.value));

/**
 * The words and tables as the server read them, or as they stream, read
 * here.
 */
const body = computed(() => {
  if (props.message.body) return props.message.body;
  if (!props.message.text.trim()) return null;
  try {
    return messageBody(props.message.text);
  } catch {
    return null;
  }
});
/** The owner's words: they write no tables, so one text holds them. */
const ownerContent = computed(() => {
  const texts = (body.value ?? []).flatMap((piece) =>
    piece.kind === 'text' ? [piece.content] : [],
  );
  return texts.length
    ? { ...texts[0]!, blocks: texts.flatMap((text) => text.blocks) }
    : null;
});

function partsOf<T extends AiMessagePart['type']>(type: T) {
  return props.message.parts.filter((part) => part.type === type) as Extract<
    AiMessagePart,
    { type: T }
  >[];
}

const steps = computed(() => partsOf('steps').flatMap((part) => part.steps));
const question = computed(() => partsOf('question')[0]);
const notices = computed(() => partsOf('notice'));
/**
 * A check that looked at all there was says so under its last answer; one
 * with more to look at goes on from the strip over the composer.
 */
const lookedAtAll = computed(
  () =>
    props.last &&
    props.answerable &&
    partsOf('continue').some((part) => !part.next),
);
const comment = computed(() => partsOf('comment')[0]);
/** What a comment is about, in a few words: the kind and what it is on. */
const commentAbout = computed(() => {
  const id = comment.value?.actionUuid;
  const action = id ? props.actionOf?.(id) : undefined;
  if (!action) return phrase.value.ai_action_comment;
  return phrase.value.ai_comment_on(actionLabel(action));
});

/** The field the owner's words were asked at, by its ✦. */
const fieldAbout = computed(() => {
  const part = partsOf('field')[0];
  if (!part) return '';
  return phrase.value.ai_message_field(
    part.ref.startsWith('asset:')
      ? phrase.value.asset_description
      : fieldName(placeField(part.place)),
  );
});

/** The template the owner's words began from, named as now. */
const templateAbout = computed(() =>
  props.message.template
    ? phrase.value.ai_message_template(publicText(props.message.template.title))
    : '',
);

/** What the model did on the way, said once per kind of step. */
const stepLine = computed(() => {
  const list = steps.value;
  if (!list.length) return [];
  const of = (tools: string[]) =>
    list.filter((step) => tools.includes(step.tool) && !step.failed);
  const refs = (items: AiStep[]) =>
    new Set(items.flatMap((step) => step.refs ?? [])).size || items.length;
  const said = phrase.value.ai_steps;
  const line: {
    icon:
      | 'thought'
      | 'search'
      | 'list-unordered'
      | 'relation-related'
      | 'calendar'
      | 'tag'
      | 'blocks'
      | 'check'
      | 'files'
      | 'filter'
      | 'warning';
    text: string;
    hint?: string;
  }[] = [];
  const read = of(['read_entity']);
  if (read.length) line.push({ icon: 'thought', text: said.read(refs(read)) });
  const searched = of(['search_archive']);
  if (searched.length)
    line.push({
      icon: 'search',
      text: said.search(
        searched
          .map((step) => (step.detail ? phrase.value.quoted(step.detail) : ''))
          .filter(Boolean)
          .slice(0, 3)
          .join(', '),
      ),
    });
  if (of(['list_entities']).length)
    line.push({ icon: 'list-unordered', text: said.list });
  if (of(['relation_graph']).length)
    line.push({ icon: 'relation-related', text: said.graph });
  if (of(['life_timeline']).length)
    line.push({ icon: 'calendar', text: said.timeline });
  if (of(['tag_candidates']).length)
    line.push({ icon: 'tag', text: said.tags });
  const digests = of(['read_digests']);
  if (digests.length)
    line.push({ icon: 'blocks', text: said.digests(refs(digests)) });
  const proposed = of(['propose']);
  if (proposed.length)
    line.push({ icon: 'check', text: said.proposed(proposed.length) });
  const refused = proposed.reduce((sum, step) => sum + (step.refused ?? 0), 0);
  if (refused)
    line.push({
      icon: 'filter',
      text: said.refused(refused),
      hint: said.refused_hint,
    });
  if (
    of(['upload_file', 'import_file', 'reprocess_file', 'file_status']).length
  )
    line.push({ icon: 'files', text: said.files });
  const failed = list.filter((step) => step.failed).length;
  if (failed) line.push({ icon: 'warning', text: said.failed(failed) });
  return line;
});

const cards = computed(() => actionCards(props.actions));

const NOTICE_ICONS = {
  stopped: 'pause-circle',
  timeout: 'pause-circle',
  interrupted: 'refresh',
  limit: 'warning',
  'no-model': 'power',
  key: 'key',
  busy: 'pause-circle',
  address: 'warning',
  model: 'warning',
  refused: 'warning',
  length: 'warning',
  turns: 'pause-circle',
  error: 'warning',
} as const;
/** How a turn may end short and be gone on with: a pause, said quietly. */
const PAUSES = new Set(['stopped', 'timeout', 'turns']);

// ---- The question --------------------------------------------------------------

const ownAnswer = ref(false);
function answer(text: string) {
  if (!question.value || question.value.answer || !props.answerable) return;
  emit('answer', props.message.messageUuid, text);
}
</script>

<template>
  <div
    v-if="message.role === 'owner'"
    class="ai-owner relative isolate mr-2 flex max-w-[min(34rem,85%)] flex-col
      gap-1.5 self-end rounded-normal rounded-br-none px-3.5 py-2.5 text-sm
      leading-normal"
    :style="{ '--ai-sent': JSON.stringify(sent) }"
    :data-message="message.messageUuid"
    data-message-role="owner"
  >
    <p
      v-if="comment"
      class="flex items-center gap-1 text-xs text-text-2"
      :data-title-popup="commentAbout"
      data-title-popup-clipped
      data-message-comment
    >
      <Icon name="comment" class="shrink-0" /><span
        class="truncate"
        data-title-popup-clip
        >{{ commentAbout }}</span
      >
    </p>
    <!-- Asked at a field's ✦: which field. -->
    <p
      v-else-if="fieldAbout"
      class="flex items-center gap-1 text-xs text-text-2"
      :data-title-popup="fieldAbout"
      data-title-popup-clipped
      data-message-field
    >
      <Icon name="sparkles" class="shrink-0" /><span
        class="truncate"
        data-title-popup-clip
        >{{ fieldAbout }}</span
      >
    </p>
    <!-- Begun from a ready-made request: which, as the picker names it. -->
    <p
      v-else-if="templateAbout"
      class="flex items-center gap-1 text-xs text-text-2"
      :data-title-popup="templateAbout"
      data-title-popup-clipped
      data-message-template
    >
      <Icon
        :name="message.template?.builtin ? 'list-check' : 'template'"
        class="shrink-0"
      /><span class="truncate" data-title-popup-clip>{{ templateAbout }}</span>
    </p>
    <AiMessageFiles :files="message.files" />
    <ContentRenderer
      v-if="ownerContent"
      :data="ownerContent as never"
      :link-resolver
      class="ai-text ai-owner-text"
    />
    <p v-else class="ai-owner-text whitespace-pre-wrap">{{ message.text }}</p>
    <time
      :datetime="new Date(message.createdAt).toISOString()"
      class="absolute right-3.5 bottom-2.5 text-2xs leading-none
        whitespace-nowrap text-text-2"
      :data-title-popup="fullWhen(message.createdAt)"
      data-message-time
      >{{ sent }}</time
    >
  </div>

  <div
    v-else-if="message.role === 'model'"
    class="flex min-w-0 flex-col gap-2.5 text-sm leading-relaxed"
    :data-message="message.messageUuid"
    data-message-role="model"
    :aria-busy="writing"
  >
    <p class="flex items-center gap-1.5 text-xs text-text-2">
      <Icon name="sparkles" class="text-accent" />
      {{ phrase.ai_session_model }}
      <AiRunningDots
        v-if="writing"
        class="ml-1"
        :label="phrase.ai_session_running"
        data-message-writing
      />
    </p>
    <div
      v-if="body?.length"
      class="ai-text flex min-w-0 flex-col gap-2.5"
      data-message-text
    >
      <template v-for="(piece, index) in body" :key="index">
        <ContentRenderer
          v-if="piece.kind === 'text'"
          :data="piece.content as never"
          :link-resolver
        />
        <AiMessageTable v-else :table="piece.table" :link-resolver />
      </template>
    </div>
    <AiMessageFiles :files="message.files" />
    <p
      v-if="stepLine.length"
      class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-3"
      data-message-steps
    >
      <span
        v-for="(step, index) in stepLine"
        :key="index"
        class="inline-flex items-center gap-1"
        :data-title-popup="step.hint"
        ><Icon :name="step.icon" />{{ step.text }}</span
      >
    </p>
    <AiActionCard
      v-for="card in cards"
      :key="card.key"
      :actions="card.actions"
    />
    <div
      v-if="question"
      class="flex flex-col gap-2 rounded-normal border border-accent/45 bg-bg-2
        px-3 py-2.5"
      data-question
    >
      <p class="flex items-center gap-1.5 text-xs font-bold text-accent">
        <Icon name="question" />{{ phrase.ai_question }}
      </p>
      <p class="text-sm">{{ question.text }}</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="option in question.options"
          :key="option"
          type="button"
          class="min-h-9 cursor-pointer rounded-full border px-3.5 py-1
            text-left text-sm transition pointer-coarse:min-h-11"
          :class="
            question.answer === option
              ? 'border-accent bg-bg-accent font-semibold text-accent'
              : question.answer || !answerable
                ? 'border-border-2 bg-bg-1 opacity-45'
                : `border-border-2 bg-bg-1 hocus:border-accent
                  hocus:text-accent`
          "
          :disabled="Boolean(question.answer) || !answerable"
          data-question-option
          @click="answer(option)"
        >
          {{ option }}
        </button>
        <button
          v-if="!question.answer && answerable"
          type="button"
          class="min-h-9 cursor-pointer rounded-full border border-dashed
            border-border-2 bg-bg-1 px-3.5 py-1 text-sm text-text-2 transition
            pointer-coarse:min-h-11 hocus:border-accent hocus:text-accent"
          data-question-own
          @click="ownAnswer = !ownAnswer"
        >
          {{ phrase.ai_question_own }}
        </button>
      </div>
      <p
        v-if="question.answer && !question.options.includes(question.answer)"
        class="text-sm text-text-2"
      >
        {{ phrase.ai_answer_to(question.answer) }}
      </p>
      <AiCommentBox
        v-if="ownAnswer && !question.answer"
        class="-mx-1 -mb-1"
        :quick="[]"
        :placeholder="phrase.ai_question_own"
        @send="(text) => answer(text)"
      />
    </div>
    <div
      v-for="(notice, index) in notices"
      :key="index"
      class="flex items-start gap-2.5 rounded-normal border px-3 py-2.5 text-sm
        leading-snug"
      :class="
        PAUSES.has(notice.kind)
          ? 'border-border-1 bg-bg-2'
          : 'border-border-warning bg-bg-warning'
      "
      :data-notice="notice.kind"
    >
      <Icon
        :name="NOTICE_ICONS[notice.kind] ?? 'warning'"
        class="mt-0.5 shrink-0"
        :class="PAUSES.has(notice.kind) ? 'text-text-2' : 'text-text-warning'"
      />
      <div class="flex min-w-0 flex-col gap-1.5">
        <span>{{ phrase.ai_notices[notice.kind] }}</span>
        <span v-if="notice.text" class="text-xs wrap-anywhere text-text-2">{{
          notice.text
        }}</span>
        <Button
          v-if="
            ['limit', 'no-model', 'key', 'address', 'model'].includes(
              notice.kind,
            )
          "
          to="/admin/ai/?tab=connection"
          variant="secondary"
          class="self-start font-semibold"
          >{{ phrase.ai_notice_connection }}</Button
        >
      </div>
    </div>
    <!-- After a pause too: a check that has looked at all there was. -->
    <p
      v-if="lookedAtAll"
      class="flex items-center gap-1.5 text-sm text-text-2"
      data-message-done
    >
      <Icon name="check" class="shrink-0" />
      {{ phrase.ai_continue_done }}
    </p>
  </div>

  <p
    v-else
    class="flex items-center gap-1.5 self-center text-center text-xs
      text-text-2"
    :data-message="message.messageUuid"
  >
    <Icon
      :name="partsOf('template').length ? 'template' : 'check'"
      class="shrink-0"
    />{{ message.text }}
  </p>
</template>

<style scoped>
/*
 * The owner's bubble: the surface of a card, tinted with the accent, and a
 * tail at its lower right: its bottom edge runs straight on into it, and its
 * side curves out to the right. The time sits in the last line's corner, as
 * far from the edges as the text is; an invisible copy of it at the end of
 * the text keeps the words from running under it.
 */
.ai-owner {
  /* The light theme's accent is deeper: less of it gives the same tint. */
  --ai-owner-surface: light-dark(
    color-mix(in oklab, var(--color-accent) 7%, var(--color-bg-3)),
    color-mix(in oklab, var(--color-accent) 12%, var(--color-bg-3))
  );
  background: var(--ai-owner-surface);
}
.ai-owner-text {
  --content-surface: var(--ai-owner-surface);
}
.ai-owner::after {
  content: '';
  position: absolute;
  z-index: -1;
  right: -0.5rem;
  bottom: 0;
  width: 1.25rem;
  height: 1.375rem;
  background: var(--ai-owner-surface);
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 22'%3E%3Cpath d='M0 0H12V2C12 12 14.6 18.8 20 22H0Z'/%3E%3C/svg%3E")
    no-repeat center / 100% 100%;
}
.ai-owner-text:is(p)::after,
.ai-owner-text > :deep(:last-child)::after {
  content: var(--ai-sent);
  display: inline-block;
  margin-left: 0.625rem;
  font-size: var(--text-2xs);
  line-height: 1;
  white-space: nowrap;
  visibility: hidden;
}
.ai-text :deep(p) {
  margin: 0;
}
.ai-text :deep(p + p) {
  margin-top: 0.6rem;
}
/* A list in a conversation is the archive's own, sized to a message. */
.ai-text :deep(.content-list) {
  --content-list-marker-size: 1.25em;
  --content-list-gap: calc(var(--spacing) * 1);
  --content-list-text-gap: calc(var(--spacing) * 2.5);
  line-height: var(--leading-normal);
}
</style>
