<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';
import { askablePlace, placeField } from '#layers/thei/shared/ai-field-ask';

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
 * its proposals standing among its chips. Nothing with AI off.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{ place: AiOfferPlace; askOnly?: boolean }>();

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
/** What it was asked and answered with nothing to propose. */
const answered = computed(() => ai?.answeredAt(props.place));
const state = computed(() =>
  offers.value.length ? 'offers' : asking.value ? 'asking' : 'idle',
);

/** The field, named as the page names its fields. */
const fieldWords = computed(() => {
  if (ai?.ref.value?.startsWith('asset:'))
    return phrase.value.asset_description;
  return fieldName(placeField(props.place));
});
/** Ready requests for this field, a tap each. */
const quick = computed(() => {
  const kinds = phrase.value.ai_field_ask_quick;
  if (ai?.ref.value?.startsWith('asset:')) return kinds.file;
  if (props.place.startsWith('text:')) return kinds.text;
  const name = placeField(props.place) as keyof typeof kinds;
  return kinds[name] ?? kinds.other;
});

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
const shown = computed(() => current.value ?? kept.value);
const closing = ref(false);
function page(step: -1 | 1) {
  const count = offers.value.length;
  index.value = (index.value + step + count) % count;
}

const button = ref<HTMLElement>();
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
  else pinned.value = false;
});
// Taken, declined or gone elsewhere: the next one comes in its place, and
// with none left the popup goes. One arriving while the box to ask in is
// open takes its place.
watch(
  () => offers.value.length,
  (count, before) => {
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
onBeforeUnmount(() => clearTimeout(timer));

async function send(text: string) {
  if (!ai || sending.value) return;
  sending.value = true;
  try {
    await ai.ask(props.place, text);
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
  <template v-if="ai && (offers.length || closing || askable || asking)">
    <button
      ref="button"
      v-bind="$attrs"
      type="button"
      class="relative -top-px inline-flex h-6 min-w-6 cursor-pointer
        items-center justify-center gap-0.5 rounded-full px-1 align-middle
        text-sm transition-colors pointer-coarse:-my-2.5 pointer-coarse:h-11
        pointer-coarse:min-w-11 popup-open:bg-bg-accent hocus:bg-bg-accent
        hocus:text-accent"
      :class="state === 'idle' ? 'text-text-3' : 'text-accent'"
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
          inline-comment
          :here="ai.ref.value"
          :decisions
          @apply="ai.accept(shown)"
          @reject="ai.reject(shown)"
          @comment="(text) => ai!.comment(shown!, text)"
          @open="(field?.open.value?.(shown.action.actionUuid), (open = false))"
        >
          <!-- Several at one field: gone through one at a time. -->
          <template v-if="offers.length > 1" #actions-start>
            <span
              class="mr-auto flex items-center text-xs text-text-2 tabular-nums"
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
      complex
    >
      <div class="flex flex-col gap-1.5" :data-ai-field-ask="place">
        <div
          v-if="asking"
          class="flex min-h-9 items-center gap-xs rounded-sm border
            border-border-1 bg-bg-1 py-0.5 pr-0.5 pl-2.5 text-sm"
          data-ai-field-asking
        >
          <AiRunningDots />
          <span class="min-w-0 flex-1">{{ phrase.ai_field_asking }}</span>
          <TheiLink
            :to="{ path: '/admin/ai/', query: { session: asking } }"
            class="shrink-0 text-xs text-text-2 underline decoration-text-2/35
              underline-offset-2 hocus:text-accent"
            >{{ phrase.ai_field_ask_open }}</TheiLink
          >
          <AiStopButton data-ai-field-stop @click="stop" />
        </div>
        <template v-else>
          <p
            v-if="answered"
            class="flex items-center gap-1 px-1 text-xs text-text-2"
            data-ai-field-answered
          >
            <Icon name="check" class="shrink-0" />
            <span class="min-w-0 flex-1">{{
              phrase.ai_field_ask_nothing
            }}</span>
            <TheiLink
              :to="{ path: '/admin/ai/', query: { session: answered } }"
              class="shrink-0 underline decoration-text-2/35 underline-offset-2
                hocus:text-accent"
              >{{ phrase.ai_field_ask_open }}</TheiLink
            >
          </p>
          <AiCommentBox
            :about="phrase.ai_field_ask(fieldWords)"
            about-icon="sparkles"
            :quick
            :placeholder="phrase.ai_field_ask_placeholder"
            @send="send"
          />
        </template>
      </div>
    </FloatingPopup>
  </template>
</template>
