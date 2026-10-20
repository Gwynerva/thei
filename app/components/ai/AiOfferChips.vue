<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import {
  relationFromEnd,
  type RelationWord,
} from '#layers/thei/shared/relation';
import { relationWordIcon } from '#layers/thei/shared/relation-display';
import type { AiEntityOffer } from '#layers/thei/shared/ai-entity';

/**
 * Tags and relations an AI proposes, among the form's own: a dashed chip
 * each, which opens the proposal as its session's card draws it — what,
 * why, where it came from — to accept into the form, decline or comment
 * on. Declined, its chip stays, faded, with its card in its declined state —
 * to bring back or never to offer again — until the card is put away.
 * Nothing with AI off.
 */
const props = defineProps<{ place: 'tags' | 'relations' }>();

const ai = useEntityAi();
const offers = computed(() =>
  ai?.shown.value
    ? [...ai.offersAt(props.place), ...ai.declinedAt(props.place)].sort(
        (a, b) => a.action.createdAt - b.action.createdAt,
      )
    : [],
);
const isDeclined = (offer: AiEntityOffer) => offer.action.state === 'rejected';

function chipOf(offer: AiEntityOffer): {
  icon: IconName;
  label: string;
  /** A relation proposed to go. */
  removal?: boolean;
} {
  const action = offer.action;
  const payload = action.payload as Record<string, any>;
  if (action.kind === 'tags') {
    const named = (tags: { ref?: string; title: string }[], sign: string) =>
      tags.map(
        (tag) =>
          `${sign}${publicText(action.refs[tag.ref ?? '']?.title ?? tag.title)}`,
      );
    return {
      icon: 'tag',
      label: [
        ...named(payload.add ?? [], ''),
        ...named(payload.remove ?? [], '−'),
      ].join(', '),
    };
  }
  // A relation reads from this end, whichever end proposed it.
  const { to: end, word } = relationFromEnd(
    {
      target: action.target,
      other: String(payload.other),
      relation: payload.relation as RelationWord,
    },
    action.refs,
    ai?.ref.value,
  );
  return {
    icon: relationWordIcon(word),
    label: end ? aiEntityName(end) : '',
    removal: payload.op === 'remove',
  };
}

const opened = ref<string>();
const anchors = new Map<string, HTMLElement>();
const openOffer = computed(() =>
  offers.value.find((offer) => offer.action.actionUuid === opened.value),
);
const popupOpen = computed({
  get: () => Boolean(openOffer.value),
  set: (value) => {
    if (value) return;
    opened.value = undefined;
    // Put away, what was declined among the chips is done with.
    ai?.letGoDeclined(props.place);
  },
});
/** The offer the card shows, kept while the card fades out. */
const shownOffer = shallowRef<typeof openOffer.value>();
watch(openOffer, (offer) => {
  if (offer) shownOffer.value = offer;
});
/**
 * A card put away is still fading out: with the last chip decided, the
 * chips' row stays until it has gone, or the card would vanish with it.
 */
const closing = ref(false);
watch(popupOpen, (now, before) => {
  if (before && !now) closing.value = true;
});
const decisions = {};
</script>

<template>
  <div
    v-if="ai && (offers.length || closing)"
    class="flex flex-wrap items-center gap-1.5"
    :data-ai-offer-chips="place"
  >
    <button
      v-for="offer in offers"
      :key="offer.action.actionUuid"
      :ref="
        (element) =>
          element
            ? anchors.set(offer.action.actionUuid, element as HTMLElement)
            : anchors.delete(offer.action.actionUuid)
      "
      type="button"
      class="inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5
        rounded-normal border border-dashed border-accent bg-bg-1 px-2.5 text-sm
        font-semibold text-accent transition-colors pointer-coarse:h-11
        popup-open:bg-bg-accent hocus:bg-bg-accent"
      :class="{
        'line-through': chipOf(offer).removal,
        'opacity-55': isDeclined(offer),
      }"
      :aria-label="phrase.ai_offer_chip(chipOf(offer).label)"
      :aria-expanded="opened === offer.action.actionUuid"
      aria-haspopup="dialog"
      :data-title-popup="chipOf(offer).label"
      data-title-popup-clipped
      :data-ai-offer-chip="offer.action.actionUuid"
      @click="
        opened =
          opened === offer.action.actionUuid
            ? undefined
            : offer.action.actionUuid
      "
    >
      <Icon name="sparkles" class="shrink-0" />
      <Icon :name="chipOf(offer).icon" class="shrink-0" />
      <span class="truncate" data-title-popup-clip>{{
        chipOf(offer).label
      }}</span>
    </button>

    <FloatingPopup
      v-model:open="popupOpen"
      :anchor="
        shownOffer ? (anchors.get(shownOffer.action.actionUuid) ?? null) : null
      "
      placement="bottom-start"
      max-width="26rem"
      @closed="closing = false"
    >
      <!-- A long change scrolls in a short window rather than being cut. -->
      <div
        v-if="shownOffer"
        class="@container scrollbar-hover
          max-h-(--floating-popup-available-height) overflow-y-auto
          overscroll-contain"
        data-ai-offer-card
      >
        <AiActionRow
          :action="shownOffer.action"
          :from="shownOffer.session"
          :form="ai.modeOf(shownOffer)"
          in-popup
          :here="ai.ref.value"
          :decisions
          @apply="(ai.accept(shownOffer), (opened = undefined))"
          @reject="ai.reject(shownOffer)"
          @restore="ai.restore(shownOffer)"
          @never="ai.never(shownOffer)"
          @comment="(text) => ai!.comment(shownOffer!, text)"
        />
      </div>
    </FloatingPopup>
  </div>
</template>
