<script lang="ts" setup>
import { contentReviewModal } from '#layers/thei/app/modals/content-review/modal';
import type { IconName } from '#thei/icons';
import type { AiActionItem } from '#layers/thei/shared/ai';
import {
  AI_ACTION_INFO,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';
import {
  actionTexts,
  type AiActionText,
} from '#layers/thei/shared/ai-action-texts';

/**
 * One action in its card, in the one shape every card has: a head on its
 * own ground saying what changes, the change itself old → new, the model's
 * reason, and a footer — correct and comment at its start, decline (✕) and
 * apply at its end. A row of a bundle keeps a checkbox and its tools on its
 * first line, and the bundle is decided at the card's foot. A new entity
 * lists its parts — sections, tags, relations — each to be left out on its
 * own; a text edit is gone through on a screen of its own.
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
   * Already in a popup: the card takes the popup's one ground, its head and
   * footer parted by rules, so the popup and its arrow stay one surface; and
   * the comment field opens in the card, where a popup of its own would
   * count as a click outside the one it is in.
   */
  inPopup?: boolean;
  /**
   * Taken into the form, which is not saved yet: it says so where it stood,
   * with the way to take it back, rather than leave and move the form.
   */
  taken?: boolean;
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
/** It waits for the owner's word: pending, and not taken into the form. */
const deciding = computed(() => pending.value && !props.taken);
const slots = useSlots();
/** Applied, and still reading as it left it. */
const undoable = computed(
  () =>
    props.action.state === 'applied' &&
    props.action.undo === 'ready' &&
    !info.value.final,
);
const restorable = computed(
  () => props.action.state === 'rejected' || props.action.state === 'undone',
);
/**
 * Its own tools — correct, open, comment — end its head's line; a row of a
 * bundle, whose decisions are the card's, says its undo or restore there
 * too. A row of its own decides in a footer across the card, as a bundle
 * does: the decisions at its end, and what leads them — a pager — at its
 * start.
 */
const hasTools = computed(
  () =>
    (pending.value && (!editing.value || props.inBundle)) ||
    (props.inBundle && (undoable.value || restorable.value)),
);
/** Neutral buttons stand out from the footer's ground: a card's, or a popup's. */
const footerButtons = computed(() =>
  props.inPopup ? ('secondary' as const) : ('raised' as const),
);
const hasFooter = computed(
  () =>
    !props.inBundle &&
    (pending.value ||
      props.taken ||
      Boolean(slots['actions-start']) ||
      undoable.value ||
      restorable.value),
);
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

/** Brought back to be decided, a «never» said of it is taken back too. */
const restoreLabel = computed(() =>
  props.action.never
    ? phrase.value.ai_action_restore_never
    : phrase.value.ai_action_restore,
);

/**
 * The undo and the way back stand where the button just pressed stood: a
 * double click would apply and undo at once. For a moment after the state
 * changes, a press there is taken as the end of the last one.
 */
let changedAt = 0;
watch(
  () => [props.action.state, props.taken],
  () => (changedAt = Date.now()),
);
function settled(run: () => void) {
  // A row of a bundle says its undo on its own line, away from the foot's
  // apply: nothing to guard there.
  if (!props.inBundle && Date.now() - changedAt < 500) return;
  run();
}

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
 * The word on the accept button. Where it changes the archive at once —
 * a session, what the AI remembers — «Применить»; in a form, what it does to
 * the form, which changes once saved: a value put in its place, items added
 * to a list or taken from it. Its hint says the rest.
 */
const applyWord = computed(() => {
  if (props.form !== 'takes') return phrase.value.ai_action_apply;
  const payload = (props.action.payload ?? {}) as {
    add?: unknown[];
    remove?: unknown[];
    op?: string;
  };
  const put = phrase.value.ai_offer_put;
  if (props.action.kind === 'relation')
    return payload.op === 'remove' ? put.remove : put.add;
  if (props.action.kind === 'tags') {
    const adds = Boolean(payload.add?.length);
    const removes = Boolean(payload.remove?.length);
    return adds && removes ? put.put : removes ? put.remove : put.add;
  }
  return put.put;
});
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
  <!-- One shape everywhere: the head says what changes; under it the
       change, old → new, then why; and a footer, its own tools at the start
       and the decision at the end. A row of a bundle keeps its checkbox and
       its tools on its first line: the bundle is decided at its foot. -->
  <div
    class="flex min-w-0 flex-col text-sm"
    :class="inBundle ? 'border-t border-border-1 first:border-t-0' : ''"
    :data-action="action.actionUuid"
    :data-action-kind="action.kind"
    :data-action-state="action.state"
  >
    <div
      class="flex min-w-0 items-start gap-2.5 px-3"
      :class="
        inBundle
          ? 'pt-2.5'
          : ['border-b border-border-1 py-2', inPopup ? '' : 'bg-bg-3']
      "
      data-action-head
    >
      <!-- In a bundle: a checkbox, or a mark once decided -->
      <button
        v-if="inBundle && pending && !fixed && !archived"
        type="button"
        role="checkbox"
        :aria-checked="picked"
        :aria-label="phrase.ai_action_pick"
        class="-m-1.5 flex shrink-0 cursor-pointer items-center justify-center
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
        class="flex size-4.5 shrink-0 items-center justify-center text-text-3"
        :class="{
          'text-text-success': action.state === 'applied',
          'text-text-error': action.state === 'failed',
        }"
      >
        <Icon :name="pending ? 'check' : (MARKS[action.state] ?? 'check')" />
      </span>

      <AiActionWhat
        :action
        :plain
        :here
        class="flex-1 py-0.5"
        :class="{
          'opacity-55': ['rejected', 'superseded', 'undone'].includes(
            action.state,
          ),
          'line-through decoration-text-3': action.state === 'superseded',
        }"
      />
      <!-- The owner's call: said at the end of the head, its words in its
           hint. -->
      <span
        v-if="pending && unsure"
        role="img"
        class="mt-0.5 flex shrink-0 text-base text-text-warning"
        :aria-label="phrase.ai_action_unsure"
        :data-title-popup="phrase.ai_action_unsure"
        data-action-unsure
        ><Icon name="warning"
      /></span>

      <!-- A row of a bundle: its own tools here -->
      <div
        v-if="inBundle && !archived && hasTools"
        class="-my-1 flex shrink-0 items-center gap-0.5"
        data-action-tools
      >
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
            <Icon name="undo" />
          </Button>
          <Button
            size="icon-sm"
            class="pointer-coarse:size-11"
            :disabled="saving || busy"
            :aria-label="phrase.ai_action_edit_save"
            :data-title-popup="phrase.ai_action_edit_save"
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
        </template>
        <Button
          v-else-if="undoable"
          variant="secondary"
          class="flex h-8 items-center gap-1 px-2 text-sm pointer-coarse:h-11"
          :disabled="busy"
          :data-title-popup="phrase.ai_action_undo"
          data-action-undo
          @click="settled(() => emit('undo'))"
        >
          <Icon name="history" />{{ phrase.ai_action_undo }}
        </Button>
        <Button
          v-else-if="restorable"
          variant="secondary"
          class="flex h-8 items-center gap-1 px-2 text-sm pointer-coarse:h-11"
          :disabled="busy"
          :aria-label="restoreLabel"
          :data-title-popup="restoreLabel"
          data-action-restore
          @click="settled(() => emit('restore'))"
        >
          <Icon name="undo" />{{ phrase.ai_action_restore_short }}
        </Button>
      </div>
    </div>

    <div
      class="flex min-w-0 flex-col gap-1.5 px-3 pt-2 pb-2.5"
      :class="{ 'opacity-55': partsOff, 'flex-1': !inBundle }"
      data-action-body
    >
      <!-- Its words, corrected in place -->
      <div
        v-if="editing"
        ref="editor"
        class="flex min-w-0 flex-col gap-2"
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
            :rows="
              text.shape === 'markdown' ? 8 : text.shape === 'lines' ? 4 : 3
            "
            :aria-label="textLabel(text) || phrase.ai_action_edit"
            :data-action-text="text.key"
          />
        </label>
      </div>

      <!-- What it changes: old → new -->
      <AiActionChange v-else :action :here :live :editable @edit="startEdit" />

      <p
        v-if="info.final && pending"
        class="flex items-center gap-1 text-xs font-semibold text-text-error"
      >
        <Icon name="warning" />{{ phrase.ai_action_final_note }}
      </p>

      <!-- A new entity's parts, each left out on its own -->
      <ul
        v-if="parts.length"
        class="flex min-w-0 flex-col gap-0.5"
        :class="{ 'pointer-events-none': partsOff }"
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
          <span class="min-w-0 wrap-anywhere">
            <span class="mr-1 text-text-3">{{ part.detail }}:</span>
            <span
              :class="{ 'text-text-3 line-through': part.state === 'kept' }"
              >{{ part.label }}</span
            >
          </span>
        </li>
      </ul>

      <!-- Why -->
      <p
        v-if="pending && action.reason"
        class="text-xs leading-snug wrap-anywhere text-text-2"
      >
        {{ action.reason }}
      </p>
      <p v-if="pending && modelWords && !editing" class="text-xs text-text-2">
        <span
          class="underline decoration-text-2/35 decoration-dotted"
          :data-title-popup="phrase.ai_action_model_words(modelWords)"
          data-action-corrected
          >{{ phrase.ai_action_corrected }}</span
        >
      </p>
      <p
        v-if="from"
        class="flex min-w-0 items-center gap-1 text-xs text-text-2"
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
      <!-- What became of it -->
      <p
        v-if="pending && action.error"
        class="text-xs leading-snug wrap-anywhere text-text-error"
        data-action-error
      >
        <b class="font-semibold">{{ phrase.ai_action_states.failed }}</b>
        {{ action.error }}
      </p>
      <p
        v-else-if="taken"
        class="text-xs leading-snug wrap-anywhere text-text-2"
        data-action-sub
        data-action-taken
      >
        {{ phrase.ai_offer_taken_row }}
      </p>
      <p
        v-else-if="!pending"
        class="text-xs leading-snug wrap-anywhere text-text-2"
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
              class="ml-1 cursor-pointer bg-transparent font-semibold
                text-accent pointer-coarse:py-2 hocus:underline"
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
    </div>

    <!-- A comment written in the card: over its footer -->
    <div v-if="commenting && inPopup" class="border-t border-border-1">
      <AiCommentBox
        :about="commentAbout"
        about-icon="comment"
        @send="sendComment"
      />
    </div>

    <!-- A row of its own decides in its footer: its tools at the start —
         after a pager, where there is one — the decision at the end. -->
    <div
      v-if="!archived && hasFooter"
      class="flex flex-wrap items-center gap-1.5 border-t border-border-1 px-3
        py-2"
      :class="{ 'bg-bg-3': !inPopup }"
      data-action-decisions
    >
      <slot name="actions-start" />
      <template v-if="deciding && !editing">
        <Button
          v-if="editable"
          :variant="footerButtons"
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
          :variant="footerButtons"
          size="icon-sm"
          class="pointer-coarse:size-11"
          :aria-label="phrase.ai_action_open"
          :data-title-popup="phrase.ai_action_open"
          data-action-open
          @click="openParts"
        >
          <Icon name="chevron-right" />
        </Button>
        <span v-if="!(revisable && !from)" class="inline-flex">
          <Button
            ref="commentTrigger"
            :variant="footerButtons"
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
      </template>
      <!-- Together, and at the end, however they wrap. -->
      <span class="ml-auto flex gap-1.5">
        <!-- Correcting its words: back as it was, or applied as corrected. -->
        <template v-if="pending && editing">
          <Button
            :variant="footerButtons"
            size="icon-sm"
            class="pointer-coarse:size-11"
            :aria-label="phrase.ai_action_edit_cancel"
            :data-title-popup="phrase.ai_action_edit_cancel"
            data-action-edit-cancel
            @click="cancelEdit"
          >
            <Icon name="undo" />
          </Button>
          <Button
            class="flex h-8 items-center gap-1 px-2.5 text-sm font-semibold
              pointer-coarse:h-11"
            :disabled="saving || busy"
            :aria-label="phrase.ai_action_edit_apply"
            :data-title-popup="phrase.ai_action_edit_apply"
            data-action-edit-apply
            @click="saveEdit"
          >
            <Icon :name="saving ? 'loading' : 'check'" />{{ applyWord }}
          </Button>
        </template>
        <!-- Taken into the form: taken back from where it stood. -->
        <Button
          v-else-if="taken"
          :variant="footerButtons"
          class="flex h-8 items-center gap-1 px-2.5 text-sm pointer-coarse:h-11"
          :data-title-popup="phrase.ai_offer_take_back_hint"
          data-action-take-back
          @click="settled(() => emit('undo'))"
        >
          <Icon name="undo" />{{ phrase.ai_offer_take_back }}
        </Button>
        <template v-else-if="pending">
          <Button
            :variant="footerButtons"
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
            class="flex h-8 items-center gap-1 px-2.5 text-sm font-semibold
              pointer-coarse:h-11"
            :data-title-popup="phrase.ai_action_open"
            data-action-open
            @click="openParts"
          >
            <Icon name="chevron-right" />{{ phrase.ai_action_open }}
          </Button>
          <Button
            v-else-if="from && form === 'session'"
            :to="sessionPath"
            class="flex h-8 items-center gap-1 px-2.5 text-sm font-semibold
              pointer-coarse:h-11"
            :data-title-popup="phrase.ai_offer_in_session"
            data-action-session
          >
            <Icon name="ai-chat" />{{ phrase.ai_offer_in_session }}
          </Button>
          <Button
            v-else
            class="flex h-8 items-center gap-1 px-2.5 text-sm font-semibold
              pointer-coarse:h-11"
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
            <Icon
              :name="busy ? 'loading' : revisable ? 'done-all' : 'check'"
            />{{ applyWord }}
          </Button>
        </template>
        <Button
          v-else-if="undoable"
          :variant="footerButtons"
          class="flex h-8 items-center gap-1 px-2.5 text-sm pointer-coarse:h-11"
          :disabled="busy"
          :data-title-popup="phrase.ai_action_undo"
          data-action-undo
          @click="settled(() => emit('undo'))"
        >
          <Icon name="history" />{{ phrase.ai_action_undo }}
        </Button>
        <Button
          v-else-if="restorable"
          :variant="footerButtons"
          class="flex h-8 items-center gap-1 px-2.5 text-sm pointer-coarse:h-11"
          :disabled="busy"
          :aria-label="restoreLabel"
          :data-title-popup="restoreLabel"
          data-action-restore
          @click="settled(() => emit('restore'))"
        >
          <Icon name="undo" />{{ phrase.ai_action_restore_short }}
        </Button>
      </span>
    </div>

    <!-- Kept in the page while closed, so it closes as it opened. -->
    <FloatingPopup
      v-if="commentMounted && !inPopup"
      :open="commenting"
      :anchor="commentButton ?? null"
      max-width="22rem"
      placement="bottom-start"
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
