<script lang="ts" setup>
import type { RouteLocationRaw } from 'vue-router';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import {
  REVIEW_VIEWS,
  type ContentReview,
  type ReviewDecision,
  type ReviewView,
} from '#layers/thei/shared/content-review';
import type { SelectOption } from '#layers/thei/app/components/field/FieldSelect.vue';
import ModalContainer from '#layers/thei/app/modals/ModalContainer.vue';
import ModalHeaderButton from '#layers/thei/app/modals/ModalHeaderButton.vue';
import FloatingPopup from '#layers/thei/app/components/FloatingPopup.vue';
import { registerDismissLayer } from '#layers/thei/app/composables/modal';
import ReviewDocument from './ReviewDocument.vue';
import ReviewList from './ReviewList.vue';
import ReviewPartCard from './ReviewPartCard.vue';
import { REVIEW_VIEW_ICONS, storedReviewView, storeReviewView } from './review';

/**
 * A change to a text gone through part by part: an AI's edit of it, or
 * another version of it. The text reads as it will, or shows what goes and
 * what comes, or is a list; each part opens where it stands and is taken or
 * left, and the way goes on to the next. Nothing changes until the parts
 * taken are taken, all at once.
 */
const props = defineProps<{
  review: ContentReview;
  mode: 'ai' | 'version';
  title: string;
  /** What is gone through, said under the title. */
  context?: string;
  /** Why, in a sentence or two, with where it came from. */
  why?: string;
  whyLink?: { to: RouteLocationRaw; label: string };
  /** The owner's word on parts so far. */
  initial?: Readonly<Record<string, ReviewDecision>>;
  /** Where what is taken goes: the stored text, or the editor's. */
  target: 'text' | 'editor';
  busy?: boolean;
  error?: string;
  /** Parts are answered with a comment: the model makes them anew. */
  commentable?: boolean;
  linkResolver?: ContentLinkResolver;
}>();
const emit = defineEmits<{
  /** Closed with the owner's word on parts so far, to keep. */
  close: [decisions: Record<string, ReviewDecision>];
  done: [decisions: Record<string, ReviewDecision>];
  comment: [partId: string, text: string];
}>();

const decisions = reactive<Record<string, ReviewDecision>>({
  ...props.initial,
});
const view = ref<ReviewView>(storedReviewView());
watch(view, storeReviewView);
const viewOptions = computed<SelectOption<ReviewView>[]>(() =>
  REVIEW_VIEWS.map((value) => ({
    value,
    label: phrase.value.ai_review_views[value],
    icon: REVIEW_VIEW_ICONS[value],
  })),
);

const partsById = computed(
  () => new Map(props.review.parts.map((part) => [part.id, part])),
);
/** The parts to decide, in the order they stand. */
const open = computed(() => props.review.parts.filter((part) => !part.settled));
const rows = computed(() => props.review.rows(decisions, view.value));
const stateOf = (id: string) => decisions[id] ?? 'pending';

const pending = computed(() =>
  open.value.filter((part) => stateOf(part.id) === 'pending'),
);
const accepted = computed(() =>
  open.value.filter((part) => stateOf(part.id) === 'accepted'),
);
/** Whether «take the sure ones» would take a part: words an AI is sure of, or all. */
const takenAsSure = (part: (typeof open.value)[number]) =>
  props.mode === 'version' || (part.sure && !part.whole);
const sure = computed(() => pending.value.filter(takenAsSure));
/** An edit with nothing it could take that way — a new order — offers none. */
const offersSure = computed(() => open.value.some(takenAsSure));
const words = computed(() => phrase.value.ai_review_modes[props.mode]);

const summary = computed(() => {
  const left = pending.value;
  return {
    words: left.filter((part) => !part.whole && !part.link).length,
    links: left.filter((part) => part.link).length,
    blocks: left.filter((part) => part.whole).length,
    unsure: props.mode === 'ai' ? left.filter((part) => !part.sure).length : 0,
  };
});

// ---- The part in hand -----------------------------------------------------------

const documentView =
  useTemplateRef<InstanceType<typeof ReviewDocument>>('documentView');
const listView = useTemplateRef<InstanceType<typeof ReviewList>>('listView');
const current = ref<string>();
const cardOpen = ref(false);
const cardAnchor = ref<HTMLElement | null>(null);
const currentPart = computed(() =>
  current.value ? partsById.value.get(current.value) : undefined,
);
const currentIndex = computed(
  () => open.value.findIndex((part) => part.id === current.value) + 1,
);

function pick(id: string, anchor: HTMLElement) {
  current.value = id;
  cardAnchor.value = anchor;
  cardOpen.value = true;
}

/** The card opens once the text has scrolled the part into sight. */
const SCROLL_SETTLES = 280;
let opening: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(opening));

/**
 * Brings a part into sight and opens it there; a list's row, which holds
 * its own decisions, is only marked.
 */
async function focusPart(id: string | undefined) {
  clearTimeout(opening);
  cardOpen.value = false;
  if (!id) return;
  current.value = id;
  await nextTick();
  if (view.value === 'list') {
    await listView.value?.reveal(id);
    return;
  }
  const anchor = documentView.value?.anchorOf(id);
  if (!anchor) return;
  anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
  opening = setTimeout(() => {
    if (current.value !== id) return;
    cardAnchor.value = documentView.value?.anchorOf(id) ?? anchor;
    cardOpen.value = true;
  }, SCROLL_SETTLES);
}

/**
 * The parts the way goes through: in the text, those it shows a mark of —
 * a part that stands on another left as it was has none — and in the list,
 * all of them.
 */
function reachable() {
  if (view.value === 'list') return open.value;
  return open.value.filter((part) => documentView.value?.anchorOf(part.id));
}

function nextPending(after?: string) {
  const list = reachable();
  const from = list.findIndex((part) => part.id === after);
  return (
    list.find(
      (part, index) => index > from && stateOf(part.id) === 'pending',
    ) ?? list.find((part) => stateOf(part.id) === 'pending')
  )?.id;
}

function setDecision(id: string, decision: ReviewDecision) {
  if (decision === 'pending') delete decisions[id];
  else decisions[id] = decision;
}

/** A decision, with what it decides of the parts that stand on it. */
function settle(id: string, decision: ReviewDecision) {
  const implied = props.review.implied?.(decisions, id, decision) ?? {};
  setDecision(id, decision);
  for (const [other, also] of Object.entries(implied)) setDecision(other, also);
}

/** A part decided, and the way on to the next that waits. */
function decide(id: string, decision: ReviewDecision) {
  settle(id, decision);
  if (decision !== 'pending' && view.value !== 'list')
    void focusPart(nextPending(id));
}

/** The part before or after the one in hand. */
function go(step: -1 | 1) {
  const list = reachable();
  if (!list.length) return;
  const index = list.findIndex((part) => part.id === current.value);
  const next =
    index === -1
      ? step === 1
        ? 0
        : list.length - 1
      : (index + step + list.length) % list.length;
  void focusPart(list[next]!.id);
}

function acceptSure() {
  for (const part of sure.value) settle(part.id, 'accepted');
  cardOpen.value = false;
}

// ---- Done ----------------------------------------------------------------------

const finishButton = useTemplateRef<HTMLElement>('finishButton');
const finishOpen = ref(false);

/**
 * Nothing taken, it closes, the owner's word kept; with something taken and
 * parts still waiting, it asks first.
 */
function finish() {
  if (!accepted.value.length) close();
  else if (pending.value.length) finishOpen.value = true;
  else done();
}

function done() {
  finishOpen.value = false;
  if (!accepted.value.length) {
    close();
    return;
  }
  emit('done', decided());
}

/** Every part to decide, with the owner's word on it so far. */
function decided() {
  const all: Record<string, ReviewDecision> = {};
  for (const part of open.value) all[part.id] = stateOf(part.id);
  return all;
}

function close() {
  emit('close', decided());
}

// Escape and Back leave the review — and say what was decided in it —
// before they reach whatever it was opened over.
const removeDismissLayer = registerDismissLayer(close);
onBeforeUnmount(removeDismissLayer);
</script>

<template>
  <!-- One root, so that a modal showing it can be hidden under another. -->
  <div class="contents">
    <!-- On a phone it fills the screen, its bar of decisions at the foot. -->
    <ModalContainer
      class="grid max-w-200 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]
        max-sm:min-h-full"
      ground="page"
      :dismiss="close"
      data-review
      :data-review-mode="mode"
    >
      <template #header>
        <div class="flex min-w-0 items-center gap-xs p-sm">
          <div class="flex min-w-0 flex-1 flex-col px-xs">
            <h2 class="truncate text-base leading-snug font-bold">
              {{ title }}
            </h2>
            <p v-if="context" class="truncate text-xs text-text-2">
              {{ context }}
            </p>
          </div>
          <FieldSelect
            v-model="view"
            :options="viewOptions"
            :label="phrase.ai_review_view"
            compact
            collapsible
            data-review-view
          />
          <ModalHeaderButton
            icon="close"
            :label="phrase.close_modal"
            data-review-close
            @click="close"
          />
        </div>
      </template>

      <div class="mx-auto w-full max-w-176 px-sm pt-md pb-lg sm:px-14">
        <div class="mb-sm flex flex-wrap gap-1.5" data-review-summary>
          <span
            v-if="summary.words"
            class="inline-flex h-6 items-center rounded-full bg-bg-accent px-2
              text-xs font-semibold text-accent"
            >{{ phrase.ai_review_words(summary.words) }}</span
          >
          <span
            v-if="summary.links"
            class="inline-flex h-6 items-center rounded-full bg-bg-accent px-2
              text-xs font-semibold text-accent"
            >{{ phrase.ai_action_relinks(summary.links) }}</span
          >
          <span
            v-if="summary.unsure"
            class="inline-flex h-6 items-center rounded-full bg-bg-warning px-2
              text-xs font-semibold text-text-warning"
            >{{ phrase.ai_review_unsure_count(summary.unsure) }}</span
          >
          <span
            v-if="summary.blocks"
            class="inline-flex h-6 items-center rounded-full bg-bg-3 px-2
              text-xs font-semibold text-text-2"
            >{{ phrase.ai_review_blocks(summary.blocks) }}</span
          >
          <span
            v-if="!pending.length"
            class="inline-flex h-6 items-center gap-1 rounded-full bg-bg-success
              px-2 text-xs font-semibold text-text-success"
            ><Icon name="check" />{{ phrase.ai_review_all_decided }}</span
          >
        </div>
        <p v-if="why || whyLink" class="mb-md text-xs leading-snug text-text-2">
          {{ why }}
          <TheiLink
            v-if="whyLink"
            :to="whyLink.to"
            class="text-accent hocus:underline"
            >{{ whyLink.label }}</TheiLink
          >
        </p>

        <ReviewList
          v-if="view === 'list'"
          ref="listView"
          :parts="review.parts"
          :mode
          :decisions
          :current
          @decide="decide"
        />
        <ReviewDocument
          v-else
          ref="documentView"
          :rows
          :parts="partsById"
          :decisions
          :view
          :mode
          :current
          :link-resolver
          @pick="pick"
        />
      </div>

      <template #footer>
        <div
          class="pb-[calc(var(--spacing)*2+env(safe-area-inset-bottom,0px))]"
        >
          <div class="mb-2 flex h-0.75 gap-0.5" aria-hidden="true">
            <span
              v-for="part in open"
              :key="part.id"
              class="flex-1"
              :class="
                stateOf(part.id) === 'accepted'
                  ? 'bg-text-success'
                  : stateOf(part.id) === 'kept'
                    ? 'bg-text-3'
                    : part.id === current
                      ? 'bg-accent'
                      : 'bg-bg-4'
              "
            ></span>
          </div>
          <div class="mx-auto flex max-w-176 items-center gap-1.5 px-sm">
            <!-- The way through the parts, as the card's own arrows go. -->
            <Button
              variant="secondary"
              size="icon-sm"
              class="bg-transparent pointer-coarse:size-11"
              :disabled="!open.length"
              :aria-label="phrase.ai_review_prev"
              :data-title-popup="phrase.ai_review_prev"
              data-review-prev-part
              @click="go(-1)"
              ><Icon name="chevron-left"
            /></Button>
            <span
              class="text-sm whitespace-nowrap tabular-nums"
              :aria-label="
                words.finish(open.length - pending.length, open.length)
              "
              data-review-count
            >
              <b>{{ open.length - pending.length }}</b>
              <span class="text-text-2"> / {{ open.length }}</span>
            </span>
            <Button
              variant="secondary"
              size="icon-sm"
              class="bg-transparent pointer-coarse:size-11"
              :disabled="!open.length"
              :aria-label="phrase.ai_review_next"
              :data-title-popup="phrase.ai_review_next"
              data-review-next
              @click="go(1)"
              ><Icon name="chevron-right"
            /></Button>
            <span class="flex-1"></span>
            <Button
              v-if="offersSure"
              variant="secondary"
              class="flex h-8 items-center gap-1 px-2 text-sm
                pointer-coarse:h-11"
              :disabled="!sure.length"
              :aria-label="`${words.sure}: ${sure.length}`"
              :data-title-popup="`${words.sure}: ${sure.length}`"
              data-review-sure
              @click="acceptSure"
              ><Icon name="done-all" /><span class="tabular-nums">{{
                sure.length
              }}</span></Button
            >
            <span ref="finishButton" class="inline-flex">
              <Button
                class="flex h-8 items-center gap-xs text-sm pointer-coarse:h-11"
                :disabled="busy"
                data-review-finish
                @click="finish"
              >
                <Icon v-if="busy" name="loading" />{{
                  accepted.length
                    ? words.apply(accepted.length)
                    : phrase.ai_review_close
                }}
              </Button>
            </span>
          </div>
          <p
            v-if="error"
            class="mx-auto mt-1 max-w-176 px-sm text-sm text-text-error"
          >
            {{ error }}
          </p>
        </div>
      </template>
    </ModalContainer>

    <FloatingPopup
      v-model:open="cardOpen"
      :anchor="cardAnchor"
      placement="bottom"
      max-width="24rem"
      density="card"
    >
      <ReviewPartCard
        v-if="currentPart"
        :part="currentPart"
        :mode
        :decision="stateOf(currentPart.id)"
        :index="currentIndex"
        :total="open.length"
        :commentable
        @decide="decide(currentPart.id, $event)"
        @go="go"
        @comment="emit('comment', currentPart.id, $event)"
      />
    </FloatingPopup>

    <FloatingPopup
      v-model:open="finishOpen"
      :anchor="finishButton"
      placement="top-end"
      max-width="22rem"
      density="card"
    >
      <div class="flex flex-col gap-sm" data-review-finish-popup>
        <b>{{ words.finish(open.length - pending.length, open.length) }}</b>
        <p class="text-xs leading-snug text-text-2">
          {{
            mode === 'ai' && target === 'editor'
              ? phrase.ai_review_finish_editor
              : words.finish_hint
          }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-if="accepted.length"
            class="flex h-8 items-center text-sm pointer-coarse:h-11"
            data-review-finish-apply
            @click="done"
            >{{ words.apply(accepted.length) }}</Button
          >
          <Button
            variant="secondary"
            class="flex h-8 items-center bg-transparent text-sm
              pointer-coarse:h-11"
            @click="finishOpen = false"
            >{{ phrase.ai_review_go_on }}</Button
          >
        </div>
      </div>
    </FloatingPopup>
  </div>
</template>
