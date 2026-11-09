<script lang="ts" setup>
import type { PublicExcerptSecret } from '#layers/thei/shared/api/public';

/**
 * An excerpt the reader may not read, in its place among the ones on its
 * parent's page: its codename with a lock, as a secret card says it, under
 * the same rule as an excerpt read there, and nothing of it — no heading of
 * the page's outline, no link.
 */
const { secret } = defineProps<{ secret: PublicExcerptSecret }>();
</script>

<template>
  <div
    class="flex min-w-0 items-center gap-sm border-t border-border-1 pt-lg
      text-text-3"
    data-public-secret
    data-excerpt-secret
  >
    <EntityTokenIcon :media="secret.iconMedia" icon="excerpt" class="size-8" />
    <span class="min-w-0 truncate text-lg font-semibold italic">{{
      secret.title
    }}</span>
    <Icon
      name="lock-close"
      :data-title-popup="phrase.secret_hint"
      :aria-label="phrase.secret_hint"
      role="img"
      class="shrink-0 opacity-60"
    />
  </div>
</template>
