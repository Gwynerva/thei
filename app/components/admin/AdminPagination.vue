<script lang="ts" setup>
import { buildAdminPaginationItems } from '#layers/thei/shared/admin/pagination';

const props = defineProps<{
  page: number;
  pageCount: number;
}>();

const emit = defineEmits<{ page: [number] }>();

const items = computed(() =>
  buildAdminPaginationItems(props.page, props.pageCount),
);

function go(page: number) {
  if (page < 1 || page > props.pageCount || page === props.page) return;
  emit('page', page);
}
</script>

<template>
  <nav
    v-if="pageCount > 1"
    class="flex flex-wrap items-center justify-center gap-xs pt-md"
    :aria-label="phrase.page_of(page, pageCount)"
  >
    <template v-for="item in items" :key="item">
      <span
        v-if="typeof item !== 'number'"
        class="flex size-9 items-center justify-center text-sm text-text-3"
        aria-hidden="true"
      >
        …
      </span>
      <button
        v-else
        type="button"
        class="flex size-9 cursor-pointer items-center justify-center
          rounded-normal border text-sm transition"
        :class="
          item === page
            ? `border-accent bg-accent/10 text-accent hocus:border-accent
              hocus:bg-accent/15`
            : `border-border-1 bg-bg-2 text-text-2 hocus:border-border-3
              hocus:bg-bg-3`
        "
        :aria-current="item === page ? 'page' : undefined"
        :aria-label="phrase.page_of(item, pageCount)"
        @click="go(item)"
      >
        {{ item }}
      </button>
    </template>
  </nav>
</template>
