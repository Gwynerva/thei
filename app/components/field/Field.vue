<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * A field of a form. In an entity's form it names the place `ai` its
 * proposals wait at, which its label shows (`field-ai.ts`).
 */
const props = defineProps<{ ai?: AiOfferPlace }>();
provideFieldAi(() => props.ai);
</script>

<template>
  <div data-field class="flex flex-col gap-xs">
    <slot></slot>
  </div>
</template>
