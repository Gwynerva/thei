<script lang="ts" setup>
import { contentReviewModal } from '#layers/thei/app/modals/content-review/modal';
import type { IconName } from '#thei/icons';
import type { AiActionItem } from '#layers/thei/shared/ai';
import { relationWordIcon } from '#layers/thei/shared/relation-display';
import { diffContentText } from '#layers/thei/shared/content-diff';
import {
  AI_ACTION_INFO,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';
import {
  actionTexts,
  type AiActionText,
} from '#layers/thei/shared/ai-action-texts';

/**
 * One action in its card. A lone one answers on its own row — comment (or
 * open, for a text edit), decline, and the accept last and wider, at the
 * edge; a row of a bundle keeps a checkbox, and the bundle is applied at its
 * foot. Under it: what it changes, why, and once decided, what became of it.
 * A new entity lists its parts — sections, tags, relations — each to be left
 * out on its own; a text edit is gone through on a screen of its own.
 */
const props = defineProps<{
  action: AiActionItem;
  inBundle?: boolean;
  picked?: boolean;
  /** An atomic bundle goes whole: its rows are not picked one by one. */
  fixed?: boolean;
  /** In a card of one kind: the kind's name is the header's. */
  plain?: boolean;
  busy?: boolean;
  /** The owner's word on the parts, shared with the card. */
  decisions: Record<string, 'accepted' | 'kept'>;
  /**
   * Under a field of a form: the session it came from, named with a link;
   * whether accepting lays it into the form, which is saved with it, or the
   * form cannot take it and it is applied from its session; and a text edit
   * opens in the text's editor.
   */
  from?: { sessionUuid: string; title: string };
  form?: 'takes' | 'applies' | 'session';
  /** The ref of the entity whose form shows it, left unnamed there. */
  here?: string;
  /**
   * Already in a popup: the comment field opens in the row, where a popup
   * of its own would count as a click outside the one it is in.
   */
  inlineComment?: boolean;
}>();
const emit = defineEmits<{
  pick: [];
  apply: [];
  reject: [];
  undo: [];
  restore: [];
  never: [];
  comment: [text: string];
  /** A text edit, opened from a form: in the editor of its text. */
  open: [];
}>();

const info = computed(
  () => AI_ACTION_INFO[props.action.kind as AiActionKind] ?? {},
);
const pending = computed(() => props.action.state === 'pending');
/** In an archived session, an action is read, not decided. */
const archived = useAiArchived();
/** It waits, is being made, or holds: what it changes is told in colour. */
const live = computed(() =>
  ['pending', 'applying', 'applied'].includes(props.action.state),
);
const unsure = computed(() => props.action.certainty === 'unsure');
const payload = computed(() => props.action.payload as Record<string, any>);
const base = computed(() => (props.action.base ?? {}) as Record<string, any>);

const MARKS: Record<string, IconName> = {
  applied: 'check',
  rejected: 'close',
  undone: 'undo',
  stale: 'refresh',
  failed: 'warning',
  superseded: 'edit',
  applying: 'loading',
};
const leadIcon = computed<IconName>(() => {
  const state = props.action.state;
  if (state === 'applied') return 'check';
  if (state === 'failed' || props.action.error) return 'warning';
  if (state === 'stale') return 'refresh';
  if (props.action.kind === 'relation')
    return relationWordIcon(payload.value.relation);
  if (props.action.kind === 'access')
    return payload.value.access === 'private' ? 'lock-close' : 'lock-open';
  return (info.value.icon as IconName | undefined) ?? 'blocks';
});

// ---- Parts -------------------------------------------------------------------

interface PartRow {
  id: string;
  label: string;
  detail?: string;
  icon: IconName;
  certainty: 'sure' | 'unsure';
  /** Decided already: applied, kept as it was, or stale. */
  state?: string;
}

const PART_LISTS = ['sections', 'tags', 'relations'] as const;

/** A new entity's parts. */
const parts = computed<PartRow[]>(() => {
  const action = props.action;
  const states = new Map(
    (action.parts ?? []).map((part) => [part.id, part.state]),
  );
  if (action.kind === 'create') {
    const fields = (payload.value.fields ?? {}) as Record<string, unknown>;
    return PART_LISTS.flatMap((list) =>
      Array.isArray(fields[list])
        ? (fields[list] as any[]).map((item, index): PartRow => {
            const id = `${list}:${index}`;
            const label =
              list === 'sections'
                ? publicText(String(item?.title ?? ''))
                : list === 'tags'
                  ? publicText(String(item))
                  : publicText(
                      action.refs[item?.ref]?.title ?? String(item?.ref ?? ''),
                    );
            return {
              id,
              label,
              detail: phrase.value.ai_action_parts[list],
              icon:
                list === 'sections'
                  ? 'project-section'
                  : list === 'tags'
                    ? 'tag'
                    : 'relation-related',
              certainty: 'sure',
              state: states.get(id),
            };
          })
        : [],
    );
  }
  return [];
});

/**
 * A text edit is gone through on its own screen, over the text: in a form,
 * the text's editor; anywhere else, the review of the edit. Only a new
 * entity's parts unfold in the row.
 */
function openParts() {
  if (props.from) emit('open');
  else
    void openModal(contentReviewModal, { actionUuid: props.action.actionUuid });
}
/** A text edit with parts to go through. */
const revisable = computed(
  () =>
    props.action.kind === 'revise' &&
    ((payload.value.parts ?? []) as unknown[]).length > 0,
);

function partOn(part: PartRow) {
  const decided = props.decisions[part.id];
  if (decided) return decided === 'accepted';
  return part.certainty === 'sure';
}

function togglePart(part: PartRow) {
  props.decisions[part.id] = partOn(part) ? 'kept' : 'accepted';
}

/** Parts of a new entity mean nothing without it. */
const partsOff = computed(
  () => props.inBundle && !props.picked && !props.fixed,
);

// ---- Correcting its words ------------------------------------------------------

/**
 * The words it carries that the owner may correct before applying it — in
 * a session, or wherever it is applied as it stands; a form that takes it
 * is corrected in the form itself.
 */
const texts = computed(() =>
  actionTexts(props.action.kind, props.action.payload),
);
const editable = computed(
  () =>
    pending.value &&
    !archived.value &&
    props.form !== 'takes' &&
    props.form !== 'session' &&
    texts.value.length > 0,
);
const editing = ref(false);
const saving = ref(false);
const drafts = reactive<Record<string, string>>({});
const editor = ref<HTMLElement>();

function startEdit() {
  if (!editable.value || editing.value) return;
  for (const text of texts.value) drafts[text.key] = text.value;
  editing.value = true;
  void nextTick(() =>
    editor.value?.querySelector<HTMLElement>('input, textarea')?.focus(),
  );
}
function cancelEdit() {
  editing.value = false;
}
// Decided meanwhile, or gone: nothing is left to correct.
watch(editable, (now) => now || (editing.value = false));

/**
 * The corrected words kept on the proposal, then — for a row that answers
 * on its own — applied as they stand; a row of a bundle waits for its foot.
 */
async function saveEdit() {
  if (saving.value) return;
  const changed = texts.value.filter(
    (text) => (drafts[text.key] ?? text.value) !== text.value,
  );
  saving.value = true;
  try {
    if (changed.length)
      await aiApi.editAction(
        props.action.actionUuid,
        Object.fromEntries(
          changed.map((text) => [text.key, drafts[text.key]!]),
        ),
      );
    editing.value = false;
    if (!props.inBundle) emit('apply');
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    saving.value = false;
  }
}

/** What a text is, when a proposal carries several. */
function textLabel(text: AiActionText) {
  if (text.field) return fieldName(text.field);
  return text.role ? phrase.value.ai_action_text_roles[text.role] : '';
}

/** The model's own words, once the owner corrected them. */
const modelWords = computed(() => {
  if (props.action.proposed === null || props.action.proposed === undefined)
    return '';
  return actionTexts(props.action.kind, props.action.proposed)
    .map((text) => publicText(text.value))
    .filter(Boolean)
    .join(' · ');
});

// ---- What became of it --------------------------------------------------------

const appliedLine = computed(() => {
  const action = props.action;
  if (action.state !== 'applied') return '';
  const by = action.appliedBy
    ? phrase.value.ai_action_by[action.appliedBy]
    : phrase.value.ai_action_by.owner;
  return phrase.value.ai_action_applied(
    by,
    action.decidedAt ? shortWhen(action.decidedAt) : '',
  );
});

const undoHint = computed(() => {
  const state = props.action.undo;
  if (props.action.state !== 'applied' || !state || state === 'ready')
    return '';
  if (info.value.final) return '';
  return phrase.value.ai_action_undo_states[state];
});

/**
 * The quote under a text written, an idea noted, a fact remembered, a word's
 * note — and the facts a memory is said again in.
 */
const quote = computed(() => {
  const kind = props.action.kind;
  if (kind === 'write' || kind === 'note')
    return plainWords(String(payload.value.markdown ?? ''));
  if (kind === 'remember') return publicText(String(payload.value.text ?? ''));
  if (kind === 'term') return publicText(String(payload.value.note ?? ''));
  if (kind === 'memory-compact')
    return ((payload.value.facts ?? []) as string[])
      .map((fact) => publicText(fact))
      .join(' · ');
  return '';
});

/** A field's value and the one it replaces. */
const fieldChange = computed(() => {
  if (props.action.kind !== 'field') return null;
  return {
    before: fieldValueWords(base.value.value),
    after: fieldValueWords(payload.value.value),
  };
});

/**
 * A description said again, word by word: what goes and what comes. A new
 * one is all words that come.
 */
const descriptionChange = computed(() => {
  if (props.action.kind !== 'describe') return null;
  return diffContentText(
    publicText(String(base.value.text ?? '')),
    publicText(String(payload.value.text ?? '')),
  );
});

/** In a form: accepting lays it into the form, or opens its session. */
const applyLabel = computed(() => {
  if (props.form === 'takes') return phrase.value.ai_offer_take;
  if (info.value.final) return phrase.value.ai_action_apply_final;
  return revisable.value
    ? phrase.value.ai_action_apply_sure
    : phrase.value.ai_action_apply;
});
const sessionPath = computed(() =>
  props.from ? `/admin/ai/?session=${props.from.sessionUuid}` : '',
);

// ---- Comment -------------------------------------------------------------------

/** The comment button itself, which its popup points at and marks open. */
const commentTrigger = useTemplateRef<{ $el: HTMLElement }>('commentTrigger');
const commentButton = computed(() => commentTrigger.value?.$el);
const commenting = ref(false);
/**
 * The comment's popup, mounted once first asked for: a list of proposals
 * needs no popup per row until then, and keeps it to close it.
 */
const commentMounted = ref(false);
watch(commenting, (now) => now && (commentMounted.value = true));
const commentAbout = computed(() =>
  phrase.value.ai_comment_on(actionLabel(props.action)),
);
function sendComment(text: string) {
  commenting.value = false;
  emit('comment', text);
}
</script>

<template>
  <div
    class="group/row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center
      gap-x-2.5 gap-y-1 border-t border-border-1/70 px-3 py-2 text-sm
      first:border-t-0 @max-[26rem]:gap-x-2 @max-[26rem]:px-2.5"
    :class="inBundle ? '' : '@max-[26rem]:grid-cols-[auto_minmax(0,1fr)]'"
    :data-action="action.actionUuid"
    :data-action-kind="action.kind"
    :data-action-state="action.state"
  >
    <!-- Lead: a checkbox in a bundle, a glyph of the kind alone, a mark once decided -->
    <button
      v-if="inBundle && pending && !fixed && !archived"
      type="button"
      role="checkbox"
      :aria-checked="picked"
      :aria-label="phrase.ai_action_pick"
      class="-m-1.5 flex cursor-pointer items-center justify-center self-start
        rounded-sm bg-transparent p-1.5 focus-visible:ring-2
        focus-visible:ring-accent pointer-coarse:-m-2.5 pointer-coarse:p-2.5"
      data-action-pick
      @click="emit('pick')"
    >
      <span
        class="flex size-4.5 items-center justify-center rounded-sm
          border-[1.5px] transition"
        :class="
          picked
            ? 'border-accent bg-accent text-white dark:text-bg-1'
            : info.final
              ? 'border-text-error bg-bg-1'
              : unsure
                ? 'border-text-warning bg-bg-1'
                : 'border-border-2 bg-bg-1'
        "
      >
        <Icon v-if="picked" name="check" class="text-xs" />
      </span>
    </button>
    <span
      v-else-if="inBundle"
      class="flex size-5 items-center justify-center self-start text-text-3"
      :class="{
        'text-text-success': action.state === 'applied',
        'text-text-error': action.state === 'failed',
      }"
    >
      <Icon :name="pending ? 'check' : (MARKS[action.state] ?? 'check')" />
    </span>
    <span
      v-else
      class="flex size-7 shrink-0 items-center justify-center self-start
        rounded-normal"
      :class="
        action.state === 'applied'
          ? 'bg-bg-success text-text-success'
          : action.state === 'failed' || action.error
            ? 'bg-bg-error text-text-error'
            : info.final
              ? 'bg-bg-error text-text-error'
              : unsure && pending
                ? 'bg-bg-warning text-text-warning'
                : 'bg-bg-3 text-text-2'
      "
    >
      <Icon :name="leadIcon" />
    </span>

    <AiActionWhat
      :action
      :plain
      :here
      :class="{
        'opacity-55': ['rejected', 'superseded', 'undone'].includes(
          action.state,
        ),
        'line-through decoration-text-3': action.state === 'superseded',
      }"
    />

    <!-- What can be done with it now -->
    <div
      v-if="!archived"
      class="flex items-center gap-0.5 self-start"
      :class="
        inBundle
          ? ''
          : `@max-[26rem]:order-last @max-[26rem]:col-span-full
            @max-[26rem]:justify-end @max-[26rem]:gap-1.5`
      "
    >
      <!-- What leads the buttons: a pager of the proposals at one field. -->
      <slot name="actions-start" />
      <!-- Correcting its words: back as it was, or kept — and applied, for
           a row that answers on its own. -->
      <template v-if="pending && editing">
        <Button
          variant="secondary"
          size="icon-sm"
          class="pointer-coarse:size-11"
          :aria-label="phrase.ai_action_edit_cancel"
          :data-title-popup="phrase.ai_action_edit_cancel"
          data-action-edit-cancel
          @click="cancelEdit"
        >
          <Icon name="close" />
        </Button>
        <Button
          size="icon-sm"
          class="pointer-coarse:size-11"
          :disabled="saving || busy"
          :aria-label="
            inBundle ? phrase.ai_action_edit_save : phrase.ai_action_edit_apply
          "
          :data-title-popup="
            inBundle ? phrase.ai_action_edit_save : phrase.ai_action_edit_apply
          "
          data-action-edit-apply
          @click="saveEdit"
        >
          <Icon :name="saving ? 'loading' : 'check'" />
        </Button>
      </template>
      <template v-else-if="pending">
        <Button
          v-if="editable"
          variant="secondary"
          size="icon-sm"
          class="pointer-coarse:size-11"
          :aria-label="phrase.ai_action_edit"
          :data-title-popup="phrase.ai_action_edit"
          data-action-edit
          @click="startEdit"
        >
          <Icon name="edit" />
        </Button>
        <Button
          v-if="revisable && !from"
          variant="secondary"
          size="icon-sm"
          class="pointer-coarse:size-11"
          :aria-label="phrase.ai_action_open"
          :data-title-popup="phrase.ai_action_open"
          data-action-open
          @click="openParts"
        >
          <Icon name="chevron-right" />
        </Button>
        <span v-else class="inline-flex">
          <Button
            ref="commentTrigger"
            variant="secondary"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="phrase.ai_action_comment"
            :data-title-popup="phrase.ai_action_comment"
            data-action-comment
            @click="commenting = !commenting"
          >
            <Icon name="comment" />
          </Button>
        </span>
        <template v-if="!inBundle">
          <Button
            variant="secondary"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :disabled="busy"
            :aria-label="phrase.ai_action_reject"
            :data-title-popup="phrase.ai_action_reject"
            data-action-reject
            @click="emit('reject')"
          >
            <Icon name="close" />
          </Button>
          <!-- In a form, a text edit is gone through in its editor, and
               what the form cannot take is applied from its session. -->
          <Button
            v-if="from && action.kind === 'revise'"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="phrase.ai_action_open"
            :data-title-popup="phrase.ai_action_open"
            data-action-open
            @click="openParts"
          >
            <Icon name="chevron-right" />
          </Button>
          <Button
            v-else-if="from && form === 'session'"
            :to="sessionPath"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="phrase.ai_offer_in_session"
            :data-title-popup="phrase.ai_offer_in_session"
            data-action-session
          >
            <Icon name="ai-chat" />
          </Button>
          <Button
            v-else
            size="icon-sm"
            class="pointer-coarse:size-11"
            :class="
              info.final
                ? `bg-bg-error! text-text-error! hocus:bg-text-error!
                  hocus:text-white!`
                : ''
            "
            :disabled="busy"
            :aria-label="applyLabel"
            :data-title-popup="applyLabel"
            data-action-apply
            @click="emit('apply')"
          >
            <Icon :name="busy ? 'loading' : revisable ? 'done-all' : 'check'" />
          </Button>
        </template>
      </template>
      <Button
        v-else-if="
          action.state === 'applied' && action.undo === 'ready' && !info.final
        "
        variant="secondary"
        size="icon-sm"
        class="pointer-coarse:size-11"
        :disabled="busy"
        :aria-label="phrase.ai_action_undo"
        :data-title-popup="phrase.ai_action_undo"
        data-action-undo
        @click="emit('undo')"
      >
        <Icon name="history" />
      </Button>
      <Button
        v-else-if="action.state === 'rejected' || action.state === 'undone'"
        variant="secondary"
        size="icon-sm"
        class="pointer-coarse:size-11"
        :disabled="busy"
        :aria-label="phrase.ai_action_restore"
        :data-title-popup="phrase.ai_action_restore"
        data-action-restore
        @click="emit('restore')"
      >
        <Icon name="rotate-right" />
      </Button>
    </div>

    <!-- Its words, corrected in place -->
    <div
      v-if="editing"
      ref="editor"
      class="col-start-2 col-end-4 flex min-w-0 flex-col gap-2"
      data-action-editing
      @keydown.esc.stop.prevent="cancelEdit"
      @keydown.enter.ctrl.prevent="saveEdit"
      @keydown.enter.meta.prevent="saveEdit"
    >
      <label
        v-for="text in texts"
        :key="text.key"
        class="flex min-w-0 flex-col gap-1"
      >
        <span v-if="texts.length > 1" class="text-xs text-text-2">{{
          textLabel(text)
        }}</span>
        <FieldInput
          v-if="text.shape === 'line'"
          v-model="drafts[text.key]"
          :aria-label="textLabel(text) || phrase.ai_action_edit"
          :data-action-text="text.key"
        />
        <FieldTextarea
          v-else
          v-model="drafts[text.key]"
          :rows="text.shape === 'markdown' ? 8 : text.shape === 'lines' ? 4 : 3"
          :aria-label="textLabel(text) || phrase.ai_action_edit"
          :data-action-text="text.key"
        />
      </label>
    </div>

    <!-- What it changes -->
    <div
      v-else-if="fieldChange"
      :class="editable ? 'cursor-text' : ''"
      :data-title-popup="editable ? phrase.ai_action_edit : undefined"
      @click="startEdit"
      class="col-start-2 col-end-4 min-w-0 border-l-2 border-border-2 pl-2.5
        text-sm leading-normal wrap-anywhere"
    >
      <!-- A change that no longer stands to be made, or made, is told
           quietly: its colours are for one that waits or holds. -->
      <template v-if="fieldChange.before">
        <span
          class="line-through decoration-1"
          :class="live ? 'text-text-error' : 'text-text-3'"
          >{{ fieldChange.before }}</span
        >
        <span class="mx-1 text-text-3">→</span>
      </template>
      <span
        class="font-medium"
        :class="live ? 'text-text-success' : 'text-text-2'"
        >{{ fieldChange.after }}</span
      >
    </div>
    <p
      v-else-if="descriptionChange"
      :class="editable ? 'cursor-text' : ''"
      :data-title-popup="editable ? phrase.ai_action_edit : undefined"
      @click="startEdit"
      class="col-start-2 col-end-4 min-w-0 border-l-2 border-border-2 pl-2.5
        text-sm leading-normal wrap-anywhere"
      data-action-description
    >
      <template v-for="(part, index) in descriptionChange" :key="index">
        <span
          v-if="part.kind === 'removed'"
          class="line-through decoration-1"
          :class="live ? 'text-text-error' : 'text-text-3'"
          >{{ part.text }}</span
        ><span
          v-else-if="part.kind === 'added'"
          class="font-medium"
          :class="live ? 'text-text-success' : 'text-text-2'"
          >{{ part.text }}</span
        ><span v-else>{{ part.text }}</span>
      </template>
    </p>
    <p
      v-else-if="quote"
      :class="editable ? 'cursor-text' : ''"
      :data-title-popup="editable ? phrase.ai_action_edit : undefined"
      @click="startEdit"
      class="col-start-2 col-end-4 line-clamp-3 min-w-0 border-l-2 border-accent
        pl-2.5 text-sm leading-normal"
    >
      {{ quote }}
    </p>
    <p
      v-if="info.final && pending"
      class="col-start-2 col-end-4 flex items-center gap-1 text-xs font-semibold
        text-text-error"
    >
      <Icon name="warning" />{{ phrase.ai_action_final_note }}
    </p>

    <!-- Its parts -->
    <ul
      v-if="parts.length"
      class="col-start-2 col-end-4 flex min-w-0 flex-col gap-0.5"
      :class="{ 'pointer-events-none opacity-45': partsOff }"
      data-action-parts
    >
      <li
        v-for="part in parts"
        :key="part.id"
        class="flex min-w-0 items-start gap-2 text-sm"
        :data-part="part.id"
        :data-part-state="part.state ?? 'pending'"
      >
        <button
          v-if="
            pending && !archived && (!part.state || part.state === 'pending')
          "
          type="button"
          role="checkbox"
          :aria-checked="partOn(part)"
          :aria-label="part.label"
          class="-m-1 flex shrink-0 cursor-pointer items-center justify-center
            rounded-sm bg-transparent p-1 focus-visible:ring-2
            focus-visible:ring-accent pointer-coarse:-m-2 pointer-coarse:p-2"
          :disabled="partsOff"
          data-part-pick
          @click="togglePart(part)"
        >
          <span
            class="flex size-4 items-center justify-center rounded-sm
              border-[1.5px] transition"
            :class="
              partOn(part)
                ? 'border-accent bg-accent text-white dark:text-bg-1'
                : part.certainty === 'unsure'
                  ? 'border-text-warning bg-bg-1'
                  : 'border-border-2 bg-bg-1'
            "
          >
            <Icon v-if="partOn(part)" name="check" class="text-2xs" />
          </span>
        </button>
        <Icon
          v-else
          :name="
            part.state === 'applied'
              ? 'check'
              : part.state === 'stale'
                ? 'refresh'
                : 'close'
          "
          class="mt-0.5 shrink-0"
          :class="
            part.state === 'applied' ? 'text-text-success' : 'text-text-3'
          "
        />
        <Icon :name="part.icon" class="mt-0.5 shrink-0 text-text-3" />
        <span class="min-w-0 wrap-anywhere">
          <span
            :class="{ 'text-text-3 line-through': part.state === 'kept' }"
            >{{ part.label }}</span
          >
          <span
            v-if="part.detail"
            class="block text-xs"
            :class="
              part.certainty === 'unsure' ? 'text-text-warning' : 'text-text-2'
            "
            >{{ part.detail }}</span
          >
        </span>
      </li>
    </ul>

    <!-- Why, or what became of it -->
    <p
      v-if="pending && unsure"
      class="col-start-2 col-end-4 text-xs leading-snug wrap-anywhere
        text-text-2"
    >
      <b class="font-semibold text-text-warning">{{
        phrase.ai_action_unsure
      }}</b>
      {{ action.reason }}
    </p>
    <p
      v-else-if="pending && action.reason"
      class="col-start-2 col-end-4 text-xs leading-snug wrap-anywhere
        text-text-2"
    >
      {{ action.reason }}
    </p>
    <p
      v-if="pending && modelWords && !editing"
      class="col-start-2 col-end-4 text-xs text-text-2"
    >
      <span
        class="underline decoration-text-2/35 decoration-dotted"
        :data-title-popup="phrase.ai_action_model_words(modelWords)"
        data-action-corrected
        >{{ phrase.ai_action_corrected }}</span
      >
    </p>
    <p
      v-if="from"
      class="col-start-2 col-end-4 flex min-w-0 items-center gap-1 text-xs
        text-text-2"
      data-action-from
    >
      <TheiLink
        :to="sessionPath"
        class="inline-flex min-w-0 items-center gap-1 underline
          decoration-text-2/35 underline-offset-2 transition-colors
          hocus:text-accent"
        :data-title-popup="sessionTitle(from)"
        data-title-popup-clipped
      >
        <Icon name="ai-chat" class="shrink-0" />
        <span class="truncate" data-title-popup-clip>{{
          phrase.quoted(sessionTitle(from))
        }}</span>
      </TheiLink>
      <span class="shrink-0">· {{ shortWhen(action.createdAt) }}</span>
    </p>
    <p
      v-if="pending && action.error"
      class="col-start-2 col-end-4 text-xs leading-snug wrap-anywhere
        text-text-error"
      data-action-error
    >
      <b class="font-semibold">{{ phrase.ai_action_states.failed }}</b>
      {{ action.error }}
    </p>
    <p
      v-else-if="!pending"
      class="col-start-2 col-end-4 text-xs leading-snug wrap-anywhere
        text-text-2"
      data-action-sub
    >
      <template v-if="action.state === 'applied'">
        {{ appliedLine
        }}<template v-if="modelWords">
          ·
          <span
            class="underline decoration-text-2/35 decoration-dotted"
            :data-title-popup="phrase.ai_action_model_words(modelWords)"
            data-action-corrected
            >{{ phrase.ai_action_corrected }}</span
          ></template
        ><template v-if="undoHint"> · {{ undoHint }}</template>
      </template>
      <template v-else-if="action.state === 'rejected'">
        <template v-if="action.never">{{
          phrase.ai_action_states.never
        }}</template>
        <template v-else>
          {{ phrase.ai_action_states.rejected
          }}<template v-if="!archived"> ·</template>
          <button
            v-if="!archived"
            type="button"
            class="cursor-pointer bg-transparent font-semibold text-accent
              pointer-coarse:py-2 hocus:underline"
            data-action-never
            @click="emit('never')"
          >
            {{ phrase.ai_action_never }}
          </button>
        </template>
      </template>
      <template v-else>
        {{
          phrase.ai_action_states[
            action.state as keyof typeof phrase.ai_action_states
          ] ?? action.state
        }}
      </template>
    </p>

    <div
      v-if="commenting && inlineComment"
      class="col-span-full -mx-3 -mb-2 border-t border-border-1/70"
    >
      <AiCommentBox
        :about="commentAbout"
        about-icon="comment"
        @send="sendComment"
      />
    </div>
    <!-- Kept in the page while closed, so it closes as it opened. -->
    <FloatingPopup
      v-if="commentMounted && !inlineComment"
      :open="commenting"
      :anchor="commentButton ?? null"
      max-width="22rem"
      placement="bottom-end"
      complex
      @update:open="commenting = $event"
    >
      <AiCommentBox
        :about="commentAbout"
        about-icon="comment"
        @send="sendComment"
      />
    </FloatingPopup>
  </div>
</template>
