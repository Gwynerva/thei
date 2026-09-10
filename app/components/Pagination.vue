<script lang="ts" setup>
import { buildPaginationControls } from '#layers/thei/shared/pagination';
import type { RouteLocationRaw } from 'vue-router';
import TheiLink from './TheiLink';

const props = defineProps<{
  page: number;
  pageCount: number;
  pageTo?: (page: number) => RouteLocationRaw;
}>();

const emit = defineEmits<{ page: [number] }>();

const items = computed(() =>
  buildPaginationControls(props.page, props.pageCount),
);

function go(page: number) {
  if (page < 1 || page > props.pageCount || page === props.page) return;
  emit('page', page);
}
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="flex flex-wrap items-center justify-center gap-xs"
    :aria-label="phrase.page_of(page, pageCount)"
  >
    <template v-for="item in items" :key="item.key">
      <span
        v-if="item.kind === 'gap'"
        class="flex size-9 items-center justify-center text-sm text-text-3"
        aria-hidden="true"
      >
        …
      </span>
      <component
        v-else
        :is="pageTo && !item.disabled ? TheiLink : 'button'"
        :to="item.disabled ? undefined : pageTo?.(item.page)"
        :type="pageTo && !item.disabled ? undefined : 'button'"
        :disabled="item.disabled"
        class="flex size-9 cursor-pointer items-center justify-center
          rounded-normal border text-sm transition disabled:pointer-events-none
          disabled:opacity-40"
        :class="
          item.kind === 'page' && item.page === page
            ? `border-accent bg-accent/10 text-accent hocus:border-accent
              hocus:bg-accent/15`
            : `border-border-1 bg-bg-2 text-text-2 hocus:border-border-3
              hocus:bg-bg-3`
        "
        :aria-current="
          item.kind === 'page' && item.page === page ? 'page' : undefined
        "
        :aria-label="
          item.kind === 'previous'
            ? phrase.previous
            : item.kind === 'next'
              ? phrase.next
              : phrase.page_of(item.page, pageCount)
        "
        @click="go(item.page)"
      >
        <Icon v-if="item.kind === 'previous'" name="chevron-left" />
        <Icon v-else-if="item.kind === 'next'" name="chevron-right" />
        <template v-else>{{ item.page }}</template>
      </component>
    </template>
  </nav>
</template>
