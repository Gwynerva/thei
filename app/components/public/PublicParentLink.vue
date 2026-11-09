<script lang="ts" setup>
import type { PublicEntityReference } from '#layers/thei/shared/api/public';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * What a card's subject belongs to, with its picture: a section's project,
 * an excerpt's parent — a diary entry named by its day.
 *
 * A section names it above its title, with an arrow down to what
 * follows; a status names it `below` its words, where no arrow is needed. A
 * parent, not a relation, so it never joins the list of related entities.
 *
 * The link stays clickable above a card's own full-size link.
 */
defineProps<{ parent: PublicEntityReference; below?: boolean }>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-xs text-sm">
    <TheiLink
      :to="parent.href"
      :data-title-popup="publicText(parent.summary) || undefined"
      class="pointer-events-auto relative z-3 inline-flex min-w-0 items-center
        gap-xs font-semibold text-text-2 transition focus-visible:ring-2
        focus-visible:ring-accent focus-visible:outline-none hocus:text-accent"
    >
      <EntityTokenIcon
        :media="parent.iconMedia"
        :icon="entityTypeIcon(parent.entityType)"
        class="size-5"
      />
      <span class="min-w-0 truncate">{{ entityListName(parent) }}</span>
    </TheiLink>
    <Icon
      v-if="!below"
      name="corner-down"
      class="shrink-0 text-text-3"
      aria-hidden="true"
    />
  </div>
</template>
