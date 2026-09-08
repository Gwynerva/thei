<script setup lang="ts">
import { useMediaInteraction } from '#layers/thei/app/composables/media-interaction';

const { engaged, events } = useMediaInteraction();
</script>

<template>
  <slot :engaged :events />
</template>
