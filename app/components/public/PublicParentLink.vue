<script lang="ts" setup>
import type { PublicEntityReference } from '#layers/thei/shared/api/public';

/**
 * The project a card's subject belongs to — a stage, a section, a status —
 * named above it with its icon and an arrow down to what follows. A parent,
 * not a relation, so it never joins the list of related entities.
 *
 * The link stays clickable above a card's own full-size link.
 */
defineProps<{ parent: PublicEntityReference }>();
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
      <BeveledIcon :media="parent.iconMedia" icon="project" class="size-5" />
      <span class="min-w-0 truncate">{{ publicText(parent.title) }}</span>
    </TheiLink>
    <Icon name="corner-down" class="shrink-0 text-text-3" aria-hidden="true" />
  </div>
</template>
