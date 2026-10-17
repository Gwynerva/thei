<script lang="ts" setup>
import type { AiMessageTable } from '#layers/thei/shared/ai-message-text';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';

/**
 * A table in a model's answer. It keeps the width its columns need and
 * scrolls sideways inside the message when that is more than the message
 * has: a thin bar over nothing, never the page. Its cells are inline markup
 * as a paragraph's, their links drawn as a text's are.
 */
const props = defineProps<{
  table: AiMessageTable;
  linkResolver?: ContentLinkResolver;
}>();

const root = ref<HTMLElement | null>(null);
const head = computed(() => props.table.rows[0] ?? []);
const body = computed(() => props.table.rows.slice(1));

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };
const alignOf = (column: number) => {
  const align = props.table.align[column];
  return align ? ALIGN[align] : 'text-left';
};
</script>

<template>
  <div
    ref="root"
    class="content-prose scrollbar-clear max-w-full overflow-x-auto
      rounded-normal border border-border-1"
    tabindex="0"
    data-message-table
  >
    <table class="w-max min-w-full border-collapse text-sm leading-snug">
      <thead class="bg-bg-2">
        <tr>
          <th
            v-for="(cell, column) in head"
            :key="column"
            scope="col"
            class="max-w-72 border-b border-border-1 px-2.5 py-1.5 align-bottom
              font-semibold"
            :class="alignOf(column)"
            v-html="publicRichText(cell)"
          ></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in body"
          :key="index"
          class="border-b border-border-1/60 last:border-b-0"
        >
          <td
            v-for="(cell, column) in row"
            :key="column"
            class="max-w-72 px-2.5 py-1.5 align-top"
            :class="alignOf(column)"
            v-html="publicRichText(cell)"
          ></td>
        </tr>
      </tbody>
    </table>
    <ContentInlineLinkDecorator :root :resolver="linkResolver" />
  </div>
</template>
