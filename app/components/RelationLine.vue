<script lang="ts" setup>
import type { RelationType } from '#layers/thei/shared/relation';
import {
  relationLabel,
  relationTypeIcon,
} from '#layers/thei/shared/relation-display';

/**
 * What a relation says, as one line under the other end's name: the
 * relation's word when it has a direction — "Influences", "Depends" — run
 * into the reason, "Influences · gave it its maps". A plain relation says
 * no word at all: the block it is in already says "related".
 *
 * Inline all through, so the caller cuts it as a line: `truncate` in a chip,
 * `line-clamp-2` in a card. A caller with neither a direction nor a text to
 * show draws no line.
 */
const { type, text, italic } = defineProps<{
  type: RelationType;
  /** The reason or what the entity says of itself, formatted. */
  text?: string;
  italic?: boolean;
}>();

const directed = computed(() => type !== 'related');
const label = computed(() => relationLabel(phrase.value, type));
</script>

<template>
  <span class="block min-w-0" data-relation-line>
    <span
      v-if="directed"
      class="font-semibold text-accent not-italic"
      data-relation-label
      ><Icon
        :name="relationTypeIcon(type)"
        class="mr-0.5"
        aria-hidden="true"
      />{{ label }}</span
    ><span v-if="directed && text" aria-hidden="true"> · </span
    ><span v-if="text" :class="{ italic }" data-relation-note>{{ text }}</span>
  </span>
</template>
