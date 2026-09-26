<script lang="ts" setup>
defineOptions({ name: 'ContentRendererList' });

type ListItem = {
  content?: string;
  meta?: { checked?: boolean };
  items?: ListItem[];
};

/** What the editor's list tool keeps about an ordered list as a whole. */
type ListMeta = {
  start?: number;
  counterType?: string;
};

const props = withDefaults(
  defineProps<{
    items: ListItem[];
    style?: 'unordered' | 'ordered' | 'checklist';
    meta?: ListMeta;
  }>(),
  { style: 'unordered', meta: undefined },
);

/**
 * The counter styles the list tool offers: as the `type` attribute names
 * them, which keeps the numbering for a reader that ignores styles, and as
 * the CSS counter style the drawn markers are counted in.
 */
const COUNTER_TYPES: Record<string, { type: string; style: string }> = {
  numeric: { type: '1', style: 'decimal' },
  'lower-roman': { type: 'i', style: 'lower-roman' },
  'upper-roman': { type: 'I', style: 'upper-roman' },
  'lower-alpha': { type: 'a', style: 'lower-alpha' },
  'upper-alpha': { type: 'A', style: 'upper-alpha' },
};

const start = computed(() =>
  props.style === 'ordered' &&
  typeof props.meta?.start === 'number' &&
  props.meta.start !== 1
    ? props.meta.start
    : undefined,
);
const counterType = computed(() =>
  props.style === 'ordered' && props.meta?.counterType
    ? COUNTER_TYPES[props.meta.counterType]
    : undefined,
);
/** The markers are drawn, so the count they show is kept by CSS. */
const listStyle = computed(() => {
  if (props.style !== 'ordered') return undefined;
  return {
    ...(start.value !== undefined
      ? { counterReset: `item ${start.value - 1}` }
      : {}),
    ...(counterType.value
      ? { '--list-counter-type': counterType.value.style }
      : {}),
  };
});
</script>

<template>
  <!-- `role="list"`: some readers stop announcing a list drawn without its
  own markers. -->
  <component
    :is="style === 'ordered' ? 'ol' : 'ul'"
    class="content-list"
    :class="`content-list-${style}`"
    role="list"
    :start="start"
    :type="counterType?.type"
    :style="listStyle"
  >
    <li
      v-for="(item, index) in items"
      :key="index"
      class="content-list__item"
      :data-checked="style === 'checklist' ? !!item.meta?.checked : undefined"
    >
      <!-- The list tool's own tick, so it is drawn alike in the editor. -->
      <span
        v-if="style === 'checklist'"
        class="content-list__check"
        aria-hidden="true"
        ><svg viewBox="0 0 24 24" fill="none">
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M7 12L10.4884 15.8372C10.5677 15.9245 10.705 15.9245 10.7844 15.8372L17 9"
          /></svg
      ></span>
      <span
        class="content-list__text"
        v-html="publicRichText(item.content)"
      ></span>
      <ContentRendererList
        v-if="item.items?.length"
        class="content-list__children"
        :items="item.items"
        :style="style"
        :meta="meta && { counterType: meta.counterType }"
      />
    </li>
  </component>
</template>
