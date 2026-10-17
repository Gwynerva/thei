<script lang="ts" setup>
import type { ContentOutputBlock } from '#layers/thei/shared/content';
import type { ContentTextDiffPart } from '#layers/thei/shared/content-diff';

/**
 * A block's words compared, drawn as the block is drawn on the page: a
 * heading as a heading, a quote as a quote, a list item by item — what goes
 * struck, what comes marked — so a comparison reads as the text does.
 */
const props = defineProps<{
  block: ContentOutputBlock;
  diff: ContentTextDiffPart[];
}>();

const data = computed(() => props.block.data as Record<string, unknown>);

/** The words cut into lines: a list's items, a quote's text and caption. */
const lines = computed(() => {
  const out: ContentTextDiffPart[][] = [[]];
  for (const part of props.diff)
    part.text.split('\n').forEach((text, index) => {
      if (index) out.push([]);
      if (text) out.at(-1)!.push({ kind: part.kind, text });
    });
  return out.filter((line) => line.length);
});

const listTag = computed(() => (data.value.style === 'ordered' ? 'ol' : 'ul'));
const headingTag = computed(() => (data.value.level === 3 ? 'h3' : 'h2'));
</script>

<template>
  <div class="content-prose min-w-0">
    <component
      :is="listTag"
      v-if="block.type === 'list'"
      class="content-list"
      :class="
        listTag === 'ol' ? 'content-list-ordered' : 'content-list-unordered'
      "
      role="list"
    >
      <li
        v-for="(line, lineIndex) in lines"
        :key="lineIndex"
        class="content-list__item"
      >
        <span class="content-list__text"
          ><template v-for="(part, index) in line" :key="index"
            ><del v-if="part.kind === 'removed'">{{ part.text }}</del
            ><ins v-else-if="part.kind === 'added'">{{ part.text }}</ins
            ><template v-else>{{ part.text }}</template></template
          ></span
        >
      </li>
    </component>
    <blockquote
      v-else-if="block.type === 'quote'"
      class="content-quote"
      :class="{ 'text-center': data.alignment === 'center' }"
    >
      <p
        v-for="(line, lineIndex) in lines"
        :key="lineIndex"
        :class="lineIndex ? 'content-quote__caption' : 'content-quote__text'"
      >
        <template v-for="(part, index) in line" :key="index"
          ><del v-if="part.kind === 'removed'">{{ part.text }}</del
          ><ins v-else-if="part.kind === 'added'">{{ part.text }}</ins
          ><template v-else>{{ part.text }}</template></template
        >
      </p>
    </blockquote>
    <component
      :is="block.type === 'header' ? headingTag : 'p'"
      v-else
      class="whitespace-pre-line"
    >
      <template v-for="(part, index) in diff" :key="index"
        ><del v-if="part.kind === 'removed'">{{ part.text }}</del
        ><ins v-else-if="part.kind === 'added'">{{ part.text }}</ins
        ><template v-else>{{ part.text }}</template></template
      >
    </component>
  </div>
</template>
