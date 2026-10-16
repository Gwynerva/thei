<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * The ✦ beside a field's label when an AI proposes something for the field.
 * The proposal opens over it while a pointer rests there — and stays while
 * the pointer moves into it — at a tap and from the keyboard, as its
 * session's card draws it: to take into the form, decline or comment on; a
 * text edit opens in the text's editor. Several are gone through one at a
 * time. Nothing with AI off, or with nothing proposed.
 */
defineOptions({ inheritAttrs: false });
const props = defineProps<{ place: AiOfferPlace }>();

const ai = useEntityAi();
const field = useFieldAi();
const offers = computed(() =>
  ai?.shown.value ? ai.offersAt(props.place) : [],
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

function entered(event: PointerEvent) {
  if (!pointing(event)) return;
  if (open.value) clearTimeout(timer);
  else later(() => (open.value = true), HOVER_OPEN_MS);
}
function left(event: PointerEvent) {
  if (!pointing(event) || pinned.value) return;
  later(() => (open.value = false), HOVER_CLOSE_MS);
}
function toggle() {
  clearTimeout(timer);
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
// with none left the popup goes.
watch(
  () => offers.value.length,
  (count) => {
    if (!count) {
      closing.value = open.value;
      open.value = false;
    } else if (index.value >= count) index.value = count - 1;
  },
);
onBeforeUnmount(() => clearTimeout(timer));

/** Parts are decided on the screen a text edit opens on, never here. */
const decisions = {};
</script>

<template>
  <template v-if="ai && (offers.length || closing)">
    <button
      ref="button"
      v-bind="$attrs"
      type="button"
      class="relative -top-px inline-flex h-6 min-w-6 cursor-pointer
        items-center justify-center gap-0.5 rounded-full px-1 align-middle
        text-sm text-accent transition-colors pointer-coarse:-my-2.5
        pointer-coarse:h-11 pointer-coarse:min-w-11 popup-open:bg-bg-accent
        hocus:bg-bg-accent"
      :aria-label="phrase.ai_field_offers(offers.length)"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :data-ai-field-offer="place"
      @pointerenter="entered"
      @pointerleave="left"
      @click.stop="toggle"
    >
      <Icon name="sparkles" />
      <span v-if="offers.length > 1" class="text-xs font-bold">{{
        offers.length
      }}</span>
    </button>
    <FloatingPopup
      v-model:open="open"
      :anchor="button ?? null"
      placement="bottom-start"
      max-width="26rem"
      @pointerenter="entered"
      @pointerleave="left"
      @closed="closing = false"
    >
      <div class="@container" :data-ai-offers="place">
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
  </template>
</template>
