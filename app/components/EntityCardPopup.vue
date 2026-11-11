<script lang="ts" setup>
import {
  ENTITY_CARD_ATTRIBUTE,
  entityCardOf,
  type LinkCardData,
} from '#layers/thei/app/composables/entity-cards';
import ExternalLinkPreviewCard from './external-links/ExternalLinkPreviewCard.vue';
import EntityLinkPreviewCard from './content/EntityLinkPreviewCard.vue';
import LinkHoverPopup from './LinkHoverPopup.vue';

/**
 * The card of an entity or of another site named anywhere on the page
 * outside a text — by a chip, a token, a row (`v-entity-card`): the card a
 * link in a text shows, opened the same way, drawn from what the page holds
 * of the target. One popup serves the page.
 */
const root = shallowRef<HTMLElement | null>(null);
const card = shallowRef<LinkCardData>();

onMounted(() => {
  root.value = document.body;
});
</script>

<template>
  <LinkHoverPopup
    :root
    :selector="`[${ENTITY_CARD_ATTRIBUTE}]`"
    unmarked
    :shows="(anchor) => Boolean(entityCardOf(anchor))"
    @show="card = entityCardOf($event)"
  >
    <ExternalLinkPreviewCard
      v-if="card && 'external' in card"
      :link="card.external"
      :note="card.note"
      :interactive="false"
      flush
      compact
    />
    <EntityLinkPreviewCard
      v-else-if="card"
      :entity-type="card.entityType"
      :title="card.title"
      :summary="card.summary"
      :date="card.date"
      :parent="card.parent"
      :note="card.note"
      :icon-media="card.iconMedia"
      :accent="card.accent"
      :interactive="false"
      flush
      compact
    />
  </LinkHoverPopup>
</template>
