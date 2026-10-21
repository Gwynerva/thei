<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * The proposals that wait at the head of a form, for no one field of it —
 * a field's own wait at its label (`AiFieldOffer`) — each a row as its
 * session's card draws it, with the session it came from. Accepted, a
 * proposal is laid into the form and saved with it, or applied at once when
 * it changes only what the AI remembers; one the form cannot take opens in
 * its session. Taken or declined, a row stays where it stood — taken, with
 * the way to take it back; declined, to bring back or never to offer again
 * — until the form is saved, so the form under it never jumps. Nothing with
 * AI off.
 */
const props = defineProps<{ place: AiOfferPlace }>();

const ai = useEntityAi();
const rows = computed(() => {
  if (!ai?.shown.value) return [];
  const taken = new Set(
    ai.takenAt(props.place).map((offer) => offer.action.actionUuid),
  );
  return [
    ...ai.offersAt(props.place),
    ...ai.takenAt(props.place),
    ...ai.declinedAt(props.place),
  ]
    .sort((a, b) => a.action.createdAt - b.action.createdAt)
    .map((offer) => ({
      offer,
      form: ai.modeOf(offer),
      taken: taken.has(offer.action.actionUuid),
    }));
});
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
      v-for="{ offer, form, taken } in rows"
      :key="offer.action.actionUuid"
      :action="offer.action"
      :from="offer.session"
      :form
      :taken
      :here="ai.ref.value"
      :decisions
      @apply="ai.accept(offer)"
      @undo="ai.untake(offer)"
      @reject="ai.reject(offer)"
      @restore="ai.restore(offer)"
      @never="ai.never(offer)"
      @comment="(text) => ai!.comment(offer, text)"
    />
  </div>
</template>
