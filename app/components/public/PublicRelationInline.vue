<script lang="ts" setup>
import type { RelationType } from '#layers/thei/shared/relation';
import { relationLabel } from '#layers/thei/shared/relation-display';

/**
 * What a relation says, in the line of the entity at its other end — an
 * excerpt's subject on its parent's page, its parent on its subject's: the
 * relation's word when it has a direction, then as much of the reason as
 * the line has room for, the whole of it in the hint. A plain relation with
 * no reason says nothing.
 */
const { type, note } = defineProps<{ type?: RelationType; note?: string }>();

const text = computed(() => (note ? publicText(note) : ''));
const shown = computed(() => (type && type !== 'related') || text.value);
const whole = computed(() =>
  [
    type && type !== 'related' ? relationLabel(phrase.value, type) : '',
    text.value,
  ]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <!-- The hint repeats the line, so it speaks only when the line is cut. -->
  <span
    v-if="shown"
    class="pointer-events-auto relative z-3 flex min-w-0 font-normal
      text-text-2"
    :data-title-popup="whole"
    data-title-popup-clipped
    data-relation-inline
  >
    <span class="min-w-0 truncate" data-title-popup-clip>
      <RelationLine :type="type ?? 'related'" :text italic class="inline!" />
    </span>
  </span>
</template>
