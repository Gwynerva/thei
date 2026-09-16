<script lang="ts" setup>
import type { PublicSecretReference } from '#layers/thei/shared/api/public';

/**
 * The generated lock icon of something hidden from visitors.
 *
 * Never a link or a button: there is nothing behind it to open. On its own it
 * takes focus, so its codename is reachable from the keyboard as well as by
 * pointer; `decorative` drops that where the codename is already written next
 * to it. The parent's class sets its size and shape.
 */
defineProps<{ secret: PublicSecretReference; decorative?: boolean }>();
</script>

<template>
  <span
    :role="decorative ? undefined : 'img'"
    :tabindex="decorative ? undefined : 0"
    :aria-label="decorative ? undefined : secret.title"
    :aria-hidden="decorative ? 'true' : undefined"
    :data-title-popup="decorative ? undefined : secret.title"
    class="block overflow-hidden"
    :class="{
      [`cursor-help focus-visible:ring-2 focus-visible:ring-accent
      focus-visible:outline-none`]: !decorative,
    }"
    data-public-secret
  >
    <Media v-bind="secret.iconMedia" class="size-full" />
  </span>
</template>
