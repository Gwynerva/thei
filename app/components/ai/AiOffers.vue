<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * The proposals that wait at the head of a form, for no one field of it —
 * a field's own wait at its label (`AiFieldOffer`) — each a row as its
 * session's card draws it, with the session it came from. Accepted, a
 * proposal is laid into the form and saved with it, or applied at once when
 * it changes only what the AI remembers; one the form cannot take opens in
 * its session. Nothing with AI off.
 */
const props = defineProps<{ place: AiOfferPlace }>();

const ai = useEntityAi();
const rows = computed(() =>
  ai?.shown.value
    ? ai.offersAt(props.place).map((offer) => ({
        offer,
        form: ai.modeOf(offer),
      }))
    : [],
);
/** Parts are decided on the screen a text edit opens on, never here. */
const decisions = {};
</script>

<template>
  <div
    v-if="ai && rows.length"
    class="@container overflow-hidden rounded-normal bg-bg-accent"
    :data-ai-offers="place"
  >
    <AiActionRow
      v-for="{ offer, form } in rows"
      :key="offer.action.actionUuid"
      :action="offer.action"
      :from="offer.session"
      :form
      :here="ai.ref.value"
      :decisions
      @apply="ai.accept(offer)"
      @reject="ai.reject(offer)"
      @comment="(text) => ai!.comment(offer, text)"
    />
  </div>
</template>
