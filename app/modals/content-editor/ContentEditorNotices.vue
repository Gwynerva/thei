<script lang="ts" setup>
import type { AiActionItem } from '#layers/thei/shared/ai';
import { waitingParts } from './review/review';

/**
 * What waits for the owner in a text opens it, and scrolls away with it: no
 * connection, a draft another tab keeps, an AI's edit of the text. Each says
 * what it is and offers what can be done with it — never a sentence in the
 * header.
 */
const props = defineProps<{
  /** The connection to the server, when it is not working. */
  status?: 'offline' | 'refused';
  /** When a draft another tab keeps was last written; none without one. */
  offerTime?: string;
  /** The same moment exactly: it moves as the other tab goes on writing. */
  offerAt?: number;
  /** An AI's edits of this text that wait. */
  reviews: AiActionItem[];
  /** When the text was saved elsewhere while this one was written in. */
  storedTime?: string;
}>();
const emit = defineEmits<{
  compareOffer: [];
  dismissOffer: [];
  compareStored: [];
  dismissStored: [];
  openReview: [action: AiActionItem];
}>();

function counts(action: AiActionItem) {
  const waiting = waitingParts(action);
  return {
    all: waiting.length,
    unsure: waiting.filter((part) => part.certainty === 'unsure').length,
  };
}

const shown = computed(
  () =>
    Boolean(props.status || props.offerTime || props.storedTime) ||
    props.reviews.length > 0,
);
</script>

<template>
  <div v-if="shown" class="flex flex-col gap-xs" data-editor-notices>
    <div
      v-if="status"
      class="@container rounded-normal border border-border-warning
        bg-bg-warning"
      data-editor-notice="offline"
    >
      <div class="flex items-start gap-2.5 px-3 py-2.5">
        <Icon name="warning" class="mt-0.5 shrink-0 text-text-warning" />
        <span class="flex min-w-0 flex-col text-sm leading-snug">
          <b class="font-semibold">{{
            status === 'offline'
              ? phrase.content_draft_status_offline_short
              : phrase.content_draft_status_refused_short
          }}</b>
          <span class="text-xs text-text-2">{{
            status === 'offline'
              ? phrase.content_draft_offline_hint
              : phrase.content_draft_status_refused
          }}</span>
        </span>
      </div>
    </div>

    <div
      v-if="storedTime"
      class="@container rounded-normal border border-border-warning
        bg-bg-warning"
      data-editor-notice="stored"
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5
          gap-y-1.5 px-3 py-2 @max-[26rem]:grid-cols-[auto_minmax(0,1fr)]"
      >
        <Icon name="warning" class="text-text-warning" />
        <span class="flex min-w-0 flex-col text-sm leading-snug">
          <b class="font-semibold">{{
            phrase.content_stored_notice(storedTime)
          }}</b>
          <span class="text-xs text-text-2">{{
            phrase.content_stored_notice_hint
          }}</span>
        </span>
        <span
          class="flex items-center gap-1 @max-[26rem]:col-span-full
            @max-[26rem]:justify-end"
        >
          <Button
            variant="secondary"
            class="flex h-8 items-center text-sm pointer-coarse:h-11"
            data-stored-compare
            @click="emit('compareStored')"
            >{{ phrase.content_draft_compare }}</Button
          >
          <Button
            variant="secondary"
            size="icon-sm"
            class="bg-transparent pointer-coarse:size-11"
            :aria-label="phrase.close_modal"
            :data-title-popup="phrase.close_modal"
            data-stored-dismiss
            @click="emit('dismissStored')"
            ><Icon name="close"
          /></Button>
        </span>
      </div>
    </div>

    <div
      v-if="offerTime"
      class="@container rounded-normal border border-border-warning
        bg-bg-warning"
      data-editor-notice="draft"
      :data-draft-offer="offerAt"
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5
          gap-y-1.5 px-3 py-2 @max-[26rem]:grid-cols-[auto_minmax(0,1fr)]"
      >
        <Icon name="history" class="text-text-warning" />
        <span class="flex min-w-0 flex-col text-sm leading-snug">
          <b class="font-semibold">{{
            phrase.content_draft_notice(offerTime)
          }}</b>
          <span class="text-xs text-text-2">{{
            phrase.content_draft_notice_hint
          }}</span>
        </span>
        <span
          class="flex items-center gap-1 @max-[26rem]:col-span-full
            @max-[26rem]:justify-end"
        >
          <Button
            variant="secondary"
            class="flex h-8 items-center text-sm pointer-coarse:h-11"
            data-draft-offer-open
            @click="emit('compareOffer')"
            >{{ phrase.content_draft_compare }}</Button
          >
          <Button
            variant="secondary"
            size="icon-sm"
            class="bg-transparent pointer-coarse:size-11"
            :aria-label="phrase.content_draft_dismiss"
            :data-title-popup="phrase.content_draft_dismiss"
            data-draft-dismiss
            @click="emit('dismissOffer')"
            ><Icon name="close"
          /></Button>
        </span>
      </div>
    </div>

    <div
      v-for="action in reviews"
      :key="action.actionUuid"
      class="@container rounded-normal border border-accent/40 bg-bg-accent"
      data-editor-notice="ai"
      :data-review-action="action.actionUuid"
    >
      <div
        class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5
          gap-y-1.5 px-3 py-2 @max-[26rem]:grid-cols-[auto_minmax(0,1fr)]"
      >
        <Icon name="sparkles" class="text-accent" />
        <span class="flex min-w-0 flex-col text-sm leading-snug">
          <b class="font-semibold"
            >{{ phrase.ai_review_title }} ·
            {{ phrase.ai_review_words(counts(action).all)
            }}<template v-if="counts(action).unsure">
              · {{ phrase.ai_review_unsure_count(counts(action).unsure) }}
            </template></b
          >
          <span v-if="action.reason" class="truncate text-xs text-text-2">{{
            publicText(action.reason)
          }}</span>
        </span>
        <span
          class="flex items-center @max-[26rem]:col-span-full
            @max-[26rem]:justify-end"
        >
          <Button
            class="flex h-8 items-center text-sm pointer-coarse:h-11"
            data-review-open
            @click="emit('openReview', action)"
            >{{ phrase.ai_action_open }}</Button
          >
        </span>
      </div>
    </div>
  </div>
</template>
