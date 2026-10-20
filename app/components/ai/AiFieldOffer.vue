<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';
import {
  askablePlace,
  FIELD_ASK_MAX,
  placeField,
} from '#layers/thei/shared/ai-field-ask';
import type { AiFieldAskKind } from '#layers/thei/shared/language/types';

/**
 * The ✦ beside a field's label. With AI on it is always there, quiet, and
 * asks the model about that field alone — a few ready requests, or the
 * owner's words — which answers in the background: the ✦ runs while it
 * does, and what it proposes waits right there. A proposal opens over the
 * ✦ while a pointer rests on it — and stays while the pointer moves into
 * it — at a tap and from the keyboard, as its session's card draws it: to
 * take into the form, decline or comment on; a text edit opens in the
 * text's editor. Several are gone through one at a time. A switch's ✦ only
 * shows what was proposed; a list's (`askOnly`, at its heading) only asks,
 * its proposals standing among its chips. An answer with nothing to propose
 * puts the box away — on a phone a sheet over the next fields — and stays
 * beside the ✦ in the model's words, a tap from the box again. Nothing with
 * AI off.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  place: AiOfferPlace;
  askOnly?: boolean;
  /** The field's name as its heading says it, where no label holds the ✦. */
  label?: string;
}>();

const ai = useEntityAi();
const field = useFieldAi();
const offers = computed(() =>
  ai?.shown.value && !props.askOnly ? ai.offersAt(props.place) : [],
);
/** It may be asked: AI on, a model to answer, and no switch. */
const askable = computed(
  () => Boolean(ai?.askable.value) && askablePlace(props.place),
);
const asking = computed(() => ai?.askingAt(props.place));
/**
 * What it was asked and has answered, with nothing waiting here now — a
 * list's proposals, standing among its chips rather than here, count too.
 */
const answered = computed(() =>
  ai?.offersAt(props.place).length ? undefined : ai?.answeredAt(props.place),
);
/**
 * The session of an answer that proposed nothing at all — not one whose
 * proposal was taken or declined since — and why, in the model's own last
 * words: read here.
 */
const nothing = ref<string>();
const said = ref('');
watch(
  answered,
  async (sessionUuid) => {
    nothing.value = undefined;
    said.value = '';
    if (!sessionUuid || !import.meta.client) return;
    const answer = await askAnswer(sessionUuid);
    if (!answer || answered.value !== sessionUuid || answer.actions.length)
      return;
    said.value = answer.said;
    nothing.value = sessionUuid;
  },
  { immediate: true },
);
const state = computed(() =>
  offers.value.length ? 'offers' : asking.value ? 'asking' : 'idle',
);
/** A list's proposals wait among its chips: its ✦ shows they do. */
const listed = computed(
  () =>
    Boolean(props.askOnly && ai?.shown.value) &&
    (ai?.offersAt(props.place).length ?? 0) > 0,
);

/**
 * The field as the form names it: the words of the label the ✦ stands in —
 * «Суть события», not a generic «Суть» — else the heading it is given, else
 * the place's own name.
 */
const labelWords = ref('');
const fieldWords = computed(() => {
  if (ai?.ref.value?.startsWith('asset:'))
    return phrase.value.asset_description;
  return labelWords.value || props.label || fieldName(placeField(props.place));
});
/**
 * The field holds something to work on: as a text says of itself, else as
 * the form reads.
 */
const filled = computed(
  () =>
    (field?.place.value === props.place ? field.filled.value?.() : undefined) ??
    ai?.filledAt(props.place) ??
    true,
);
/**
 * Ready requests for this field, a tap each: those that mend what is there
 * only once there is something — no «check the dates» with none.
 */
const kind = computed<AiFieldAskKind>(() =>
  ai?.ref.value?.startsWith('asset:')
    ? 'file'
    : props.place.startsWith('text:')
      ? 'text'
      : placeField(props.place) in phrase.value.ai_field_ask_quick
        ? (placeField(props.place) as AiFieldAskKind)
        : 'other',
);
const mending = computed(
  () => phrase.value.ai_field_ask_quick_filled[kind.value] ?? [],
);
const quick = computed(() => [
  ...phrase.value.ai_field_ask_quick[kind.value],
  ...(filled.value ? mending.value : []),
]);
/** Nothing to offer an empty field: said, so the box is not a riddle. */
const emptyHint = computed(
  () => !quick.value.length && !filled.value && mending.value.length > 0,
);

/** The proposal shown, of several. */
const index = ref(0);
const current = computed(
  () => offers.value[Math.min(index.value, offers.value.length - 1)],
);
/**
 * The last one decided stays in the popup while it goes, and the ✦ with it:
 * a popup taken away with its anchor would vanish rather than close.
 */
const kept = shallowRef<typeof current.value>();
watch(current, (offer) => offer && (kept.value = offer), { immediate: true });
/**
 * The one just declined here stays in the popup in its declined state — to
 * bring back, or never to offer again — until the owner goes on: paging to
 * the next, or putting the popup away.
 */
const declinedId = ref<string>();
const declined = computed(() =>
  declinedId.value
    ? ai
        ?.declinedAt(props.place)
        .find((offer) => offer.action.actionUuid === declinedId.value)
    : undefined,
);
const shown = computed(() => declined.value ?? current.value ?? kept.value);
const closing = ref(false);
function page(step: -1 | 1) {
  declinedId.value = undefined;
  const count = offers.value.length;
  index.value = (index.value + step + count) % count;
}
function decline(offer: NonNullable<typeof shown.value>) {
  declinedId.value = offer.action.actionUuid;
  void ai?.reject(offer);
}
async function restore(offer: NonNullable<typeof shown.value>) {
  await ai?.restore(offer);
  declinedId.value = undefined;
}

const button = ref<HTMLElement>();
// The label's words, read once the ✦ is drawn: it waits for the form's AI.
watch(button, (element) => {
  const words = element && fieldLabelWords(element);
  if (words !== undefined) labelWords.value = words;
});
const open = ref(false);
/** Opened by a click, a tap or the keyboard, it stays until put away. */
const pinned = ref(false);
/** The box to ask in, a form of its own: a sheet on a phone. */
const askOpen = ref(false);
const sending = ref(false);

/** How long a pointer rests before it opens, and may be away before it closes. */
const HOVER_OPEN_MS = 300;
const HOVER_CLOSE_MS = 300;
let timer: ReturnType<typeof setTimeout> | undefined;
function later(run: () => void, ms: number) {
  clearTimeout(timer);
  timer = setTimeout(run, ms);
}
const pointing = (event: PointerEvent) =>
  event.pointerType === 'mouse' || event.pointerType === 'pen';

// Only proposals open at a resting pointer: asking is a click away.
function entered(event: PointerEvent) {
  if (!pointing(event) || !offers.value.length) return;
  if (open.value) clearTimeout(timer);
  else later(() => (open.value = true), HOVER_OPEN_MS);
}
function left(event: PointerEvent) {
  if (!pointing(event) || pinned.value) return;
  later(() => (open.value = false), HOVER_CLOSE_MS);
}
function toggle() {
  clearTimeout(timer);
  if (!offers.value.length) {
    askOpen.value = !askOpen.value;
    return;
  }
  if (open.value && pinned.value) open.value = false;
  else {
    open.value = true;
    pinned.value = true;
  }
}
watch(open, (now) => {
  if (now) index.value = 0;
  else {
    pinned.value = false;
    // Put away, what was declined at the field is done with.
    declinedId.value = undefined;
    ai?.letGoDeclined(props.place);
  }
});
// Taken, declined or gone elsewhere: the next one comes in its place, and
// with none left the popup goes. One arriving while the box to ask in is
// open takes its place.
watch(
  () => offers.value.length,
  (count, before) => {
    // The one just declined stays shown, in its declined state.
    if (!count && declinedId.value) return;
    if (!count) {
      closing.value = open.value;
      open.value = false;
    } else if (index.value >= count) index.value = count - 1;
    if (count && !before && askOpen.value) {
      askOpen.value = false;
      open.value = true;
      pinned.value = true;
    }
  },
);
// Answered with nothing to propose: the box goes — on a phone, a sheet over
// the fields to go on to — and the answer stays beside the ✦.
watch(nothing, (now, before) => {
  if (now && now !== before) askOpen.value = false;
});
// A list's ask answered with proposals among its chips: the box to ask in
// goes — on a phone, a sheet over them — so they are seen where they stand.
watch(
  () =>
    props.askOnly && !asking.value
      ? (ai?.offersAt(props.place).length ?? 0)
      : 0,
  (count) => {
    if (count) askOpen.value = false;
  },
);
onBeforeUnmount(() => clearTimeout(timer));

async function send(text: string) {
  if (!ai || sending.value) return;
  sending.value = true;
  try {
    await ai.ask(props.place, text, fieldWords.value);
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  } finally {
    sending.value = false;
  }
}

async function stop() {
  try {
    await ai?.stopAsk(props.place);
  } catch (caught) {
    showToast(errorMessage(caught, phrase.value.ai_error));
  }
}

/** Parts are decided on the screen a text edit opens on, never here. */
const decisions = {};
</script>

<template>
  <template
    v-if="ai && (offers.length || closing || declined || askable || asking)"
  >
    <button
      ref="button"
      v-bind="$attrs"
      type="button"
      class="relative -top-px inline-flex h-6 min-w-6 cursor-pointer
        items-center justify-center gap-0.5 rounded-full px-1 align-middle
        text-sm transition-colors pointer-coarse:-my-2.5 pointer-coarse:h-11
        pointer-coarse:min-w-11 popup-open:bg-bg-accent hocus:bg-bg-accent
        hocus:text-accent"
      :class="state === 'idle' && !listed ? 'text-text-3' : 'text-accent'"
      :aria-label="
        state === 'offers'
          ? phrase.ai_field_offers(offers.length)
          : state === 'asking'
            ? phrase.ai_field_asking
            : phrase.ai_field_ask(fieldWords)
      "
      :data-title-popup="
        state === 'idle'
          ? phrase.ai_field_ask(fieldWords)
          : state === 'asking'
            ? phrase.ai_field_asking
            : undefined
      "
      aria-haspopup="dialog"
      :aria-expanded="open || askOpen"
      :data-ai-field-offer="place"
      :data-ai-field-state="state"
      @pointerenter="entered"
      @pointerleave="left"
      @click.stop="toggle"
    >
      <AiRunningDots v-if="state === 'asking'" class="mx-0.5" />
      <Icon v-else name="sparkles" />
      <span v-if="offers.length > 1" class="text-xs font-bold">{{
        offers.length
      }}</span>
    </button>
    <!-- What it answered with nothing to propose, in the model's words: a
         line beside the ✦, which opens the box with all of it again. -->
    <button
      v-if="nothing && state === 'idle'"
      type="button"
      class="relative -top-px ml-1 inline-flex max-w-full cursor-pointer
        items-center gap-1 rounded-sm px-1 align-middle text-xs font-normal
        text-text-2 transition-colors pointer-coarse:-my-2.5
        pointer-coarse:min-h-11 hocus:text-accent"
      :aria-label="
        said
          ? `${phrase.ai_field_ask_nothing}: ${said}`
          : phrase.ai_field_ask_nothing
      "
      :data-title-popup="said || phrase.ai_field_ask_nothing"
      data-title-popup-clipped
      data-field-label-extra
      data-ai-field-said
      @click.stop="askOpen = true"
    >
      <Icon name="ai-chat" class="shrink-0" />
      <span class="min-w-0 truncate" data-title-popup-clip>{{
        said || phrase.ai_field_ask_nothing
      }}</span>
    </button>

    <!-- What is proposed for the field. -->
    <FloatingPopup
      v-model:open="open"
      :anchor="button ?? null"
      placement="bottom-start"
      max-width="26rem"
      @pointerenter="entered"
      @pointerleave="left"
      @closed="closing = false"
    >
      <!-- A long change scrolls in a short window rather than being cut. -->
      <div
        class="@container scrollbar-hover
          max-h-(--floating-popup-available-height) overflow-y-auto
          overscroll-contain"
        :data-ai-offers="place"
      >
        <AiActionRow
          v-if="shown"
          :key="shown.action.actionUuid"
          :action="shown.action"
          :from="shown.session"
          :form="ai.modeOf(shown)"
          in-popup
          :here="ai.ref.value"
          :decisions
          @apply="ai.accept(shown)"
          @reject="decline(shown)"
          @restore="restore(shown)"
          @never="ai.never(shown)"
          @comment="(text) => ai!.comment(shown!, text)"
          @open="(field?.open.value?.(shown.action.actionUuid), (open = false))"
        >
          <!-- Several at one field: gone through one at a time. -->
          <template v-if="offers.length > 1" #actions-start>
            <span
              class="flex items-center text-xs text-text-2 tabular-nums"
              data-ai-field-offer-pager
            >
              <Button
                variant="secondary"
                size="icon-sm"
                class="bg-transparent pointer-coarse:size-11"
                :aria-label="phrase.ai_field_offer_prev"
                :data-title-popup="phrase.ai_field_offer_prev"
                data-ai-field-offer-prev
                @click="page(-1)"
                ><Icon name="chevron-left"
              /></Button>
              {{ index + 1 }}/{{ offers.length }}
              <Button
                variant="secondary"
                size="icon-sm"
                class="bg-transparent pointer-coarse:size-11"
                :aria-label="phrase.ai_field_offer_next"
                :data-title-popup="phrase.ai_field_offer_next"
                data-ai-field-offer-next
                @click="page(1)"
                ><Icon name="chevron-right"
              /></Button>
            </span>
          </template>
        </AiActionRow>
      </div>
    </FloatingPopup>

    <!-- Asking about the field: what to do, and while it is answered, that
         it is, with a way to stop it. -->
    <FloatingPopup
      v-model:open="askOpen"
      :anchor="button ?? null"
      placement="bottom-start"
      max-width="24rem"
      density="compact"
      complex
    >
      <!-- Its room is the popup's, which scrolls it when an answer makes it
           taller than the room its side has. -->
      <div class="flex flex-col gap-1.5" :data-ai-field-ask="place">
        <AiAskState
          :asking
          :answered="nothing"
          :said
          :nothing="phrase.ai_field_ask_nothing"
          mark="ai-field"
          @stop="stop"
        />
        <template v-if="!asking">
          <p
            v-if="emptyHint && !nothing"
            class="px-1 text-xs text-text-2"
            data-ai-field-empty
          >
            {{ phrase.ai_field_ask_empty }}
          </p>
          <AiCommentBox
            :about="phrase.ai_field_ask(fieldWords)"
            about-icon="sparkles"
            :quick
            :placeholder="phrase.ai_field_ask_placeholder"
            :max="FIELD_ASK_MAX"
            @send="send"
          />
        </template>
      </div>
    </FloatingPopup>
  </template>
</template>
