<script lang="ts" setup>
/**
 * One part of a file window's panel: a caption in small capitals, with a
 * count when it lists something, over what it holds. The panel lays them one
 * under another with a hairline between (`divide-y`), on its own ground —
 * no box of their own.
 */
defineProps<{ title?: string; count?: number }>();
</script>

<template>
  <section class="flex flex-col gap-xs p-sm">
    <h3
      v-if="title"
      class="flex items-baseline gap-1 text-2xs font-bold tracking-wide
        text-text-3 uppercase"
    >
      {{ title
      }}<span
        v-if="count"
        class="tracking-normal text-text-2 normal-case tabular-nums"
        >{{ count }}</span
      >
    </h3>
    <slot></slot>
  </section>
</template>
