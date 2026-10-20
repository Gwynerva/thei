<script lang="ts" setup>
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * A field of a form. In an entity's form it names the place `ai` its
 * proposals wait at, which its label shows (`field-ai.ts`), and the `need`
 * its form says it by when it cannot be saved without it (`form-needs.ts`):
 * its label is marked then, and the form brings it into view.
 */
const props = defineProps<{ ai?: AiOfferPlace; need?: string }>();
provideFieldAi(() => props.ai);
const needs = injectFormNeeds();
provide(
  FIELD_NEED_MARKED,
  computed(() => Boolean(props.need && needs?.marked(props.need))),
);
</script>

<template>
  <div data-field :data-need="need" class="flex flex-col gap-xs">
    <slot></slot>
  </div>
</template>
