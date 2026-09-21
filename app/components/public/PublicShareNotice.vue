<script lang="ts" setup>
/**
 * Tells a visitor holding a share link what they are looking at.
 *
 * Without it the private view is indistinguishable from a published page, and
 * the address could be passed on in the belief that it is public.
 */
const expiresAt = useShareAccess();
</script>

<template>
  <p
    v-if="expiresAt"
    class="flex flex-wrap items-center gap-xs rounded-normal border
      border-border-warning bg-bg-warning p-sm text-sm text-text-warning"
  >
    <Icon name="lock-partial" class="shrink-0" />
    <span>{{ phrase.share_link_notice }}</span>
    <TheiTime :datetime="expiresAt" />
  </p>
</template>
