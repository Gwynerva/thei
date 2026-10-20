<script lang="ts" setup>
import type { AiActionItem } from '#layers/thei/shared/ai';
import { scrollIntoSight } from '#layers/thei/app/modals/layer-motion';
import {
  AI_ACTION_INFO,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';
import type { AiBuiltinTemplateKey } from '#layers/thei/shared/ai-template';

/**
 * Above a session's composer while several proposals wait in it: how many,
 * a click to the next one down the thread — a check's run may leave a
 * hundred in a dozen cards, the first far up — and the sure ones applied at
 * once, with a way back. Nothing is declined from here: what is not sure
 * waits for the owner's word on its card. Once no sure ones wait, a check
 * with more to look at goes on from here — how much it has looked at, and
 * its next batch a click away — where the owner is, however far up its
 * last answer.
 */
const props = defineProps<{
  actions: AiActionItem[];
  scroller?: HTMLElement;
  /**
   * What is left of a check: its next batch, and how far it has come — in
   * what it looks at, files or texts, as its `key` says.
   */
  more?: { next: number; looked: number; key?: AiBuiltinTemplateKey };
  goingOn?: boolean;
  /** The session answers: what it proposes is still coming. */
  running?: boolean;
}>();
const emit = defineEmits<{ continue: [] }>();

const pending = computed(() =>
  props.actions.filter((action) => action.state === 'pending'),
);
/** Sure ones a click may apply: never a final one, nor a text decided part by part. */
const sure = computed(() =>
  pending.value.filter(
    (action) =>
      action.certainty === 'sure' &&
      !AI_ACTION_INFO[action.kind as AiActionKind]?.final &&
      action.kind !== 'revise',
  ),
);
const busy = ref(false);

/**
 * The sure ones are applied once the batch is all there, and never by a
 * click meant for what stood in the same place a moment before — «Проверить
 * ещё» pressed twice.
 */
const applying = computed(() => sure.value.length > 1 && !props.running);
let shownAt = 0;
watch(applying, (now) => {
  if (now) shownAt = Date.now();
});
const SETTLE_MS = 800;

/** The row gone to last: the next click goes on from it. */
let cursor: string | undefined;
function goNext() {
  const box = props.scroller;
  if (!box) return;
  const rows = pending.value.flatMap(
    (action) =>
      box.querySelector<HTMLElement>(
        `[data-action="${CSS.escape(action.actionUuid)}"]`,
      ) ?? [],
  );
  rows.sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const from = cursor
    ? box.querySelector<HTMLElement>(`[data-action="${CSS.escape(cursor)}"]`)
    : null;
  const target =
    (from &&
      rows.find(
        (row) =>
          from.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
      )) ||
    rows[0];
  if (!target) return;
  cursor = target.dataset.action;
  scrollIntoSight(target);
}

async function applySure() {
  if (!sure.value.length) return;
  if (Date.now() - shownAt < SETTLE_MS) return;
  await aiAttempt(
    () =>
      applyAndTell(
        sure.value.map((action) => action.actionUuid),
        { undoable: true },
      ),
    busy,
  );
}
</script>

<template>
  <!-- On a phone the button goes under the count rather than cut it. -->
  <div
    v-if="pending.length > 1 || more"
    class="mx-auto flex w-full max-w-184 flex-wrap items-center gap-x-2 gap-y-1
      pb-1.5 text-sm"
    data-session-waiting
  >
    <button
      v-if="pending.length > 1"
      type="button"
      class="flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-sm
        px-2 text-text-2 transition pointer-coarse:h-11 hocus:bg-bg-2
        hocus:text-text-1"
      :data-title-popup="phrase.ai_session_waiting_next"
      data-session-waiting-next
      @click="goNext"
    >
      <Icon name="action-click" class="shrink-0 text-accent" />
      <span class="truncate">{{
        phrase.ai_session_waiting(pending.length)
      }}</span>
      <Icon name="chevron-right" class="shrink-0 -rotate-90" />
    </button>
    <span
      v-else-if="more?.looked"
      class="min-w-0 truncate px-2 text-text-2"
      data-session-looked
      >{{ phrase.ai_continue_looked(more.looked, more.key) }}</span
    >
    <Button
      v-if="applying"
      variant="secondary"
      class="ml-auto flex h-8 shrink-0 items-center gap-1.5 px-sm font-semibold
        pointer-coarse:h-11"
      :disabled="busy"
      :data-title-popup="phrase.ai_session_apply_sure_hint"
      data-session-apply-sure
      @click="applySure"
    >
      <Icon :name="busy ? 'loading' : 'check'" />{{
        phrase.ai_session_apply_sure(sure.length)
      }}
    </Button>
    <!-- Once no sure ones wait, the check goes on — from beside the count,
         never from where «Применить уверенные» stands: pressed twice, one
         button must not turn into the other under the pointer. -->
    <Button
      v-else-if="more"
      variant="secondary"
      class="flex h-8 shrink-0 items-center gap-1.5 px-sm font-semibold
        pointer-coarse:h-11"
      :disabled="goingOn"
      :data-title-popup="phrase.ai_continue_hint"
      data-session-continue
      @click="emit('continue')"
    >
      {{ phrase.ai_continue_more(more.next, more.key) }}
      <Icon :name="goingOn ? 'loading' : 'chevron-right'" />
    </Button>
  </div>
</template>
