<script lang="ts" setup>
/**
 * A CSV or TSV file as the table it is: its first row the head, which stays
 * in sight while the rows scroll under it. The table keeps the width its
 * columns need and scrolls sideways inside its box.
 */
const props = defineProps<{ rows: string[][]; more: boolean }>();

/**
 * As many columns as a table shows: a row gone wrong — one long line read
 * as thousands of fields — would pad every row to its width.
 */
const MAX_COLUMNS = 100;

const head = computed(() => props.rows[0] ?? []);
const body = computed(() => props.rows.slice(1));
const columns = computed(() =>
  Math.min(
    MAX_COLUMNS,
    props.rows.reduce((most, row) => Math.max(most, row.length), 0),
  ),
);
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-normal border
      border-border-1 bg-bg-document"
  >
    <div
      class="scrollbar-hover min-h-0 flex-1 overflow-auto"
      tabindex="0"
      data-own-arrows
    >
      <table
        class="w-max min-w-full border-collapse text-sm leading-snug"
        data-file-preview-table
      >
        <thead class="sticky top-0 bg-bg-document">
          <tr>
            <th
              v-for="column in columns"
              :key="column"
              scope="col"
              class="max-w-80 border-b border-border-1 px-2.5 py-1.5 text-left
                align-bottom font-semibold whitespace-pre-wrap"
            >
              {{ head[column - 1] ?? '' }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in body"
            :key="index"
            class="border-b border-border-1/60 last:border-b-0"
          >
            <td
              v-for="column in columns"
              :key="column"
              class="max-w-80 px-2.5 py-1.5 align-top whitespace-pre-wrap"
            >
              {{ row[column - 1] ?? '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="more"
      class="shrink-0 border-t border-border-1 px-sm py-xs text-xs text-text-3"
    >
      {{ phrase.file_preview_rows_shown(body.length) }}
    </p>
  </div>
</template>
