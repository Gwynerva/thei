<script lang="ts" setup>
import type { PublicEntityReference } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { RelationType } from '#layers/thei/shared/relation';
import { entityCardFromLink } from '#layers/thei/app/composables/entity-cards';

/**
 * What a card's subject belongs to, as its chip (`EntityChip`): a section's
 * project, an excerpt's parent — a diary entry named by its day. Resting on
 * the chip shows its card.
 *
 * A section names it above its title, with an arrow down to what
 * follows; a status names it `below` its words, where no arrow is needed. A
 * parent, not a relation, so it never joins the list of related entities.
 *
 * The chip stays clickable above a card's own full-size link.
 */
defineProps<{
  parent: PublicEntityReference;
  below?: boolean;
  /**
   * How the card's subject relates to this one, said after its name: an
   * excerpt's relation to the page it is shown on.
   */
  relation?: { type: RelationType; note?: string };
}>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-xs text-sm">
    <EntityChip
      :title="entityListName(parent)"
      :href="parent.href"
      :media="parent.iconMedia"
      :icon="entityTypeIcon(parent.entityType)"
      :card="entityCardFromLink(parent)"
      size="sm"
      class="pointer-events-auto z-3 max-w-2/3 shrink-0"
    />
    <PublicRelationInline
      v-if="relation"
      :type="relation.type"
      :note="relation.note"
    />
    <Icon
      v-if="!below"
      name="corner-down"
      class="shrink-0 text-text-3"
      aria-hidden="true"
    />
  </div>
</template>
