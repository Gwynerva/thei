<script lang="ts" setup>
import type {
  PublicExcerpt,
  PublicExcerptSecret,
} from '#layers/thei/shared/api/public';
import { placeExcerptSecrets } from '#layers/thei/shared/excerpt-secrets';

/**
 * A page's own excerpts, read whole after its text, in the owner's order:
 * those the reader may not read keep their places by their codenames. The
 * diary entry's, the event's and the project's pages show them alike.
 */
const { excerpts, secrets } = defineProps<{
  excerpts: PublicExcerpt[];
  secrets: PublicExcerptSecret[];
}>();

const placed = computed(() => placeExcerptSecrets(excerpts, secrets));
</script>

<template>
  <div v-if="placed.length" class="flex flex-col gap-lg">
    <template
      v-for="item in placed"
      :key="item.secret ? item.excerpt.key : item.excerpt.publicId"
    >
      <PublicExcerptSecretInline v-if="item.secret" :secret="item.excerpt" />
      <PublicExcerptInline v-else :excerpt="item.excerpt" />
    </template>
  </div>
</template>
