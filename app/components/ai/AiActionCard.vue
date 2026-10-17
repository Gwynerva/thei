<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';
import type { AiActionItem } from '#layers/thei/shared/ai';
import {
  AI_ACTION_INFO,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';

/**
 * Actions proposed together, as one card: a header with what they are and
 * how many are sure or the owner's call, a row each, and at its foot
 * «Apply · N» for the ticked ones — the unticked are declined. An atomic
 * bundle is applied whole or not at all. A lone action is a card of one row
 * that answers on its own.
 */
const props = defineProps<{ actions: AiActionItem[] }>();

/** The entities its rows name are drawn as links in a text are. */
const root = ref<HTMLElement | null>(null);
const linkResolver = useContentLinkResolver('admin');

const lone = computed(() => props.actions.length === 1);
const atomic = computed(() => props.actions.some((action) => action.atomic));
const pending = computed(() =>
  props.actions.filter((action) => action.state === 'pending'),
);
const sameKind = computed(
  () =>
    props.actions.length > 1 &&
    props.actions.every((action) => action.kind === props.actions[0]!.kind),
);
const busy = ref(false);
/** In an archived session, a bundle is read, not applied. */
const archived = useAiArchived();

const isFinal = (action: AiActionItem) =>
  Boolean(AI_ACTION_INFO[action.kind as AiActionKind]?.final);

/** The ticked rows: sure ones by default, a final one never. */
const picks = reactive(new Map<string, boolean>());
function picked(action: AiActionItem) {
  if (atomic.value) return true;
  return (
    picks.get(action.actionUuid) ??
    (action.certainty === 'sure' && !isFinal(action))
  );
}
function pick(action: AiActionItem) {
  picks.set(action.actionUuid, !picked(action));
}

/** The owner's word on the parts of each action. */
const decisions = reactive(
  new Map<string, Record<string, 'accepted' | 'kept'>>(),
);
function decisionsOf(action: AiActionItem) {
  let found = decisions.get(action.actionUuid);
  if (!found) {
    found = reactive({});
    decisions.set(action.actionUuid, found);
  }
  return found;
}
function partsOf(actions: AiActionItem[]) {
  const parts: Record<string, Record<string, 'accepted' | 'kept'>> = {};
  for (const action of actions) {
    const decided = decisions.get(action.actionUuid);
    if (decided && Object.keys(decided).length)
      parts[action.actionUuid] = { ...decided };
  }
  return parts;
}

const chosen = computed(() => pending.value.filter((action) => picked(action)));
const counts = computed(() => {
  const sure = pending.value.filter(
    (action) => action.certainty === 'sure',
  ).length;
  return {
    sure,
    unsure: pending.value.length - sure,
    applied: props.actions.filter((action) => action.state === 'applied')
      .length,
  };
});

const title = computed(() => {
  if (sameKind.value) {
    return `${kindName(props.actions[0]!.kind)} · ${props.actions.length}`;
  }
  return phrase.value.ai_action_card_title(props.actions.length);
});
const icon = computed<IconName>(
  () =>
    (sameKind.value &&
      (AI_ACTION_INFO[props.actions[0]!.kind as AiActionKind]?.icon as
        IconName | undefined)) ||
    'blocks',
);

// ---- Answers ------------------------------------------------------------------

async function run(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await work();
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    busy.value = false;
  }
}

/** Applies these; says why not, when it did not. */
async function applyNow(actions: AiActionItem[]) {
  const outcome = await aiApi.apply(
    actions.map((action) => action.actionUuid),
    partsOf(actions),
  );
  // Every entity whose version moved: a relation's other end too.
  tellEntitiesChanged(outcome.changed);
  if (outcome.refused) showToast(outcome.refused);
  else if (outcome.failed) showToast(outcome.failed.error);
  return !outcome.refused && !outcome.failed;
}

function applyOne(action: AiActionItem) {
  return run(async () => {
    await applyNow([action]);
  });
}

function applyBundle() {
  return run(async () => {
    const left = pending.value.filter((action) => !picked(action));
    if (chosen.value.length && !(await applyNow(chosen.value))) return;
    // What the owner left unticked is declined.
    for (const action of left) await aiApi.reject(action.actionUuid);
    if (left.length) offerNever(left);
  });
}

function offerNever(actions: AiActionItem[]) {
  showToast(phrase.value.ai_toast_declined(actions.length), {
    label: phrase.value.ai_action_never,
    run: async () => {
      try {
        for (const action of actions) await aiApi.never(action.actionUuid);
        showToast(phrase.value.ai_toast_never);
      } catch (caught) {
        showToast(errorMessage(caught, phrase.value.ai_error));
      }
    },
  });
}

function reject(actions: AiActionItem[]) {
  return run(async () => {
    for (const action of actions) await aiApi.reject(action.actionUuid);
    offerNever(actions);
  });
}

function never(action: AiActionItem) {
  return run(async () => {
    await aiApi.never(action.actionUuid);
    showToast(phrase.value.ai_toast_never);
  });
}

function undo(action: AiActionItem) {
  return run(async () => {
    const answer = await aiApi.undo(action.actionUuid);
    tellEntitiesChanged([action.target?.ref, ...answer.changed]);
    showToast(phrase.value.ai_toast_undone);
  });
}

function restore(action: AiActionItem) {
  return run(async () => {
    await aiApi.restore(action.actionUuid);
    showToast(phrase.value.ai_toast_restored);
  });
}

function comment(action: AiActionItem, text: string) {
  return run(async () => {
    await aiApi.comment(action.actionUuid, text);
    showToast(phrase.value.ai_toast_comment_sent);
  });
}

/** Whether the card is done with: nothing waits, something applied. */
const settled = computed(() =>
  pending.value.length ? '' : counts.value.applied ? 'applied' : 'done',
);
</script>

<template>
  <div
    ref="root"
    class="@container min-w-0 overflow-hidden rounded-normal border
      border-border-1 bg-bg-2 [--ai-chip-surface:var(--color-bg-2)]"
    :data-card="lone ? 'single' : 'bundle'"
    :data-card-state="settled || 'pending'"
  >
    <AiActionRow
      v-if="lone"
      :action="actions[0]!"
      :decisions="decisionsOf(actions[0]!)"
      :busy
      @apply="applyOne(actions[0]!)"
      @reject="reject([actions[0]!])"
      @never="never(actions[0]!)"
      @undo="undo(actions[0]!)"
      @restore="restore(actions[0]!)"
      @comment="(text: string) => comment(actions[0]!, text)"
    />
    <template v-else>
      <div class="flex min-w-0 items-center gap-2 px-3 py-2.5">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-normal
            bg-bg-accent text-accent"
        >
          <Icon :name="icon" />
        </span>
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{
          title
        }}</span>
        <template v-if="pending.length">
          <AiPill v-if="counts.sure">{{ counts.sure }}</AiPill>
          <AiPill
            v-if="counts.unsure"
            tone="warning"
            :data-title-popup="phrase.ai_action_unsure"
            >{{ counts.unsure }}</AiPill
          >
        </template>
        <AiPill v-else-if="counts.applied" tone="success"
          ><Icon name="check" />{{ counts.applied }}</AiPill
        >
      </div>
      <AiActionRow
        v-for="action in actions"
        :key="action.actionUuid"
        :action
        in-bundle
        :picked="picked(action)"
        :fixed="atomic"
        :plain="sameKind"
        :busy
        :decisions="decisionsOf(action)"
        @pick="pick(action)"
        @undo="undo(action)"
        @restore="restore(action)"
        @never="never(action)"
        @comment="(text: string) => comment(action, text)"
      />
      <div
        v-if="pending.length && !archived"
        class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t
          border-border-1 bg-bg-3/35 px-3 py-2"
      >
        <Button
          class="flex h-8 items-center gap-1.5 font-semibold whitespace-nowrap
            pointer-coarse:h-11"
          :disabled="busy || (!chosen.length && !atomic)"
          data-card-apply
          @click="applyBundle"
        >
          <Icon v-if="busy" name="loading" />
          {{ phrase.ai_action_apply_count(chosen.length) }}
        </Button>
        <span class="min-w-32 flex-1 text-xs text-text-3">{{
          atomic
            ? phrase.ai_action_atomic_hint
            : pending.length > chosen.length
              ? phrase.ai_action_unticked_hint
              : ''
        }}</span>
        <Button
          variant="secondary"
          size="icon-sm"
          class="pointer-coarse:size-11"
          :disabled="busy"
          :aria-label="phrase.ai_action_reject_all"
          :data-title-popup="phrase.ai_action_reject_all"
          data-card-reject
          @click="reject(pending)"
        >
          <Icon name="close" />
        </Button>
      </div>
    </template>
    <ContentInlineLinkDecorator :root :resolver="linkResolver" />
  </div>
</template>
