<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * A section's title, with an optional action beside it — usually
 * `SectionAddButton`.
 *
 * From `sm` up the action sits to the right of the text. On a phone the
 * header is centred, so the action moves under the description instead of
 * squeezing it into a column, and there it can carry a visible label.
 * A list an AI may be asked about in an entity's form — its tags, its
 * relations — names its place (`ai`): the ✦ stands by the title.
 */
defineProps<{
  icon?: IconName;
  title?: string;
  description?: string;
  /** The place of a list an AI may be asked about, in an entity's form. */
  ai?: AiOfferPlace;
}>();

defineSlots<{ action?: () => unknown }>();
</script>

<template>
  <div
    class="flex flex-col gap-sm align-top sm:flex-row sm:items-center
      sm:justify-between sm:gap-md"
  >
    <div class="flex min-w-0 flex-col sm:flex-1">
      <div
        class="flex flex-col items-center justify-center gap-xs text-lg
          font-semibold text-text-2 sm:flex-row sm:justify-start"
      >
        <Icon v-if="icon" :name="icon" />
        <!-- The ✦ stays on the title's line, centred with it on a phone,
             rather than on a line of its own like an ornament. -->
        <span
          v-if="title"
          class="inline-flex max-w-full flex-wrap items-center justify-center
            gap-xs text-center sm:justify-start sm:text-left"
        >
          <h2>{{ title }}</h2>
          <AiFieldOffer v-if="ai" :place="ai" :label="title" ask-only />
        </span>
        <AiFieldOffer v-else-if="ai" :place="ai" ask-only />
      </div>
      <p v-if="description" class="text-center text-text-3 sm:text-left">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.action" class="flex shrink-0 justify-center">
      <slot name="action"></slot>
    </div>
  </div>
</template>
