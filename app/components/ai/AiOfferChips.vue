<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import {
  RELATION_WORD_FROM_OTHER_END,
  type RelationWord,
} from '#layers/thei/shared/relation';
import { relationWordIcon } from '#layers/thei/shared/relation-display';
import type { AiEntityOffer } from '#layers/thei/shared/ai-entity';

/**
 * Tags and relations an AI proposes, among the form's own: a dashed chip
 * each, which opens the proposal as its session's card draws it — what,
 * why, where it came from — to accept into the form, decline or comment
 * on. Nothing with AI off.
 */
const props = defineProps<{ place: 'tags' | 'relations' }>();

const ai = useEntityAi();
const offers = computed(() =>
  ai?.shown.value ? ai.offersAt(props.place) : [],
);

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
  const fromHere = action.target?.ref === ai?.ref.value;
  const end = fromHere ? action.refs[payload.other] : action.target;
  const word: RelationWord = fromHere
    ? payload.relation
    : RELATION_WORD_FROM_OTHER_END[payload.relation as RelationWord];
  const name = end
    ? end.type === 'diary-entry'
      ? entityListName({ date: end.title })
      : publicText(end.title)
    : '';
  return {
    icon: relationWordIcon(word),
    label: name,
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
    if (!value) opened.value = undefined;
  },
});
/** The offer the card shows, kept while the card fades out. */
const shownOffer = shallowRef<typeof openOffer.value>();
watch(openOffer, (offer) => {
  if (offer) shownOffer.value = offer;
});
const decisions = {};
</script>

<template>
  <div
    v-if="ai && offers.length"
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
      :class="{ 'line-through': chipOf(offer).removal }"
      :aria-label="phrase.ai_offer_chip(chipOf(offer).label)"
      :aria-expanded="opened === offer.action.actionUuid"
      aria-haspopup="dialog"
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
      <span class="truncate">{{ chipOf(offer).label }}</span>
    </button>

    <FloatingPopup
      v-model:open="popupOpen"
      :anchor="
        shownOffer ? (anchors.get(shownOffer.action.actionUuid) ?? null) : null
      "
      placement="bottom-start"
      max-width="26rem"
    >
      <div v-if="shownOffer" class="@container" data-ai-offer-card>
        <AiActionRow
          :action="shownOffer.action"
          :from="shownOffer.session"
          :form="ai.modeOf(shownOffer)"
          inline-comment
          :here="ai.ref.value"
          :decisions
          @apply="(ai.accept(shownOffer), (opened = undefined))"
          @reject="(ai.reject(shownOffer), (opened = undefined))"
          @comment="(text) => ai!.comment(shownOffer!, text)"
        />
      </div>
    </FloatingPopup>
  </div>
</template>
