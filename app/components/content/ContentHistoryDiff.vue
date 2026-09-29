<script lang="ts" setup>
import type {
  ContentOutputBlock,
  ContentOutputData,
} from '#layers/thei/shared/content';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import {
  diffContentBlocks,
  type ContentDiffItem,
} from '#layers/thei/shared/content-diff';
import ContentRenderer from '#layers/thei/app/components/content/ContentRenderer.vue';

/**
 * The text as it is now, marked with what restoring a version would do to
 * it: red for blocks that would go, green for blocks that would come, yellow
 * for blocks that would be rewritten. Within a rewritten block of text the
 * words that would go are struck out and the words that would come are
 * green; a block changed otherwise shows both its states. It is a read-only
 * copy shown in place of the editor, so looking changes nothing in the editor
 * itself.
 */
const props = defineProps<{
  current: ContentOutputData;
  version: ContentOutputData;
  linkResolver?: ContentLinkResolver;
}>();

type Kind = 'same' | 'removed' | 'added';
type Rewrite = Extract<ContentDiffItem, { kind: 'changed' }>;
type Section =
  | { kind: Kind; blocks: ContentOutputBlock[] }
  | { kind: 'changed'; items: Rewrite[] };

/** Consecutive blocks that stay, go, come or are rewritten share one frame. */
const sections = computed(() => {
  const result: Section[] = [];
  for (const item of diffContentBlocks(props.current, props.version, {
    formatText: publicText,
  })) {
    const last = result.at(-1);
    if (item.kind === 'changed') {
      if (last?.kind === 'changed') last.items.push(item);
      else result.push({ kind: 'changed', items: [item] });
    } else if (last?.kind === item.kind) last.blocks.push(item.block);
    else result.push({ kind: item.kind, blocks: [item.block] });
  }
  return result;
});

/**
 * A private section's edges are not content the renderer draws; within a
 * section they are shown as labelled lines between runs of blocks.
 */
function segments(blocks: ContentOutputBlock[]) {
  const result: (
    | { type: 'blocks'; blocks: ContentOutputBlock[] }
    | { type: 'boundary'; block: ContentOutputBlock }
  )[] = [];
  for (const block of blocks) {
    const last = result.at(-1);
    if (block.type === 'privateSectionBoundary')
      result.push({ type: 'boundary', block });
    else if (last?.type === 'blocks') last.blocks.push(block);
    else result.push({ type: 'blocks', blocks: [block] });
  }
  return result;
}

const root = useTemplateRef<HTMLElement>('root');

onMounted(async () => {
  await nextTick();
  const first = root.value?.querySelector<HTMLElement>('[data-diff]');
  if (!first) return;
  // The first difference starts just below the header, which stays over the
  // text while it scrolls.
  const header = root.value?.parentElement?.previousElementSibling;
  const headerHeight =
    header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  first.style.scrollMarginTop = `calc(${headerHeight}px + var(--spacing-sm))`;
  first.scrollIntoView({ block: 'start', behavior: 'instant' });
});

const frame = {
  removed: 'border-border-error bg-bg-error/60 opacity-75',
  changed: 'border-border-warning bg-bg-warning/60',
  added: 'border-border-success bg-bg-success/60',
} as const;

const tone = {
  removed: 'text-text-error',
  changed: 'text-text-warning',
  added: 'text-text-success',
} as const;

const icon = { removed: 'minus', changed: 'edit', added: 'plus' } as const;

function label(kind: keyof typeof frame) {
  return kind === 'removed'
    ? phrase.value.content_diff_removed
    : kind === 'added'
      ? phrase.value.content_diff_added
      : phrase.value.content_diff_changed;
}

function boundaryLabel(block: ContentOutputBlock) {
  return (block.data as { edge?: string }).edge === 'end'
    ? phrase.value.content_private_section_end
    : phrase.value.content_private_section_start;
}

/** A rewritten heading keeps looking like one. */
function textClass(block: ContentOutputBlock) {
  return block.type === 'header' ? 'text-lg font-semibold' : undefined;
}
</script>

<template>
  <div ref="root" class="relative w-full px-sm py-md" data-content-history-diff>
    <template v-for="(section, index) in sections" :key="index">
      <div
        :data-diff="section.kind === 'same' ? undefined : section.kind"
        :class="
          section.kind === 'same'
            ? undefined
            : [
                'my-md rounded-normal border-l-4 px-sm py-sm',
                frame[section.kind],
              ]
        "
      >
        <div
          v-if="section.kind !== 'same'"
          class="mb-1 flex items-center gap-1 text-xs font-semibold"
          :class="tone[section.kind]"
        >
          <Icon :name="icon[section.kind]" aria-hidden="true" />
          {{ label(section.kind) }}
        </div>

        <template v-if="section.kind === 'changed'">
          <div
            v-for="(item, itemIndex) in section.items"
            :key="itemIndex"
            :class="
              itemIndex
                ? 'mt-sm border-t border-border-warning pt-sm'
                : undefined
            "
            data-diff-rewrite
          >
            <p
              v-if="item.words"
              class="my-xs whitespace-pre-line"
              :class="textClass(item.block)"
            >
              <template
                v-for="(part, partIndex) in item.words"
                :key="partIndex"
              >
                <del
                  v-if="part.kind === 'removed'"
                  class="rounded-sm bg-bg-error text-text-error"
                  data-diff-words="removed"
                  >{{ part.text }}</del
                ><ins
                  v-else-if="part.kind === 'added'"
                  class="rounded-sm bg-bg-success text-text-success
                    no-underline"
                  data-diff-words="added"
                  >{{ part.text }}</ins
                ><template v-else>{{ part.text }}</template>
              </template>
            </p>
            <template v-else>
              <div class="text-xs text-text-3">
                {{ phrase.content_diff_before }}
              </div>
              <ContentRenderer
                class="opacity-60"
                :data="{ blocks: [item.previous] }"
                :link-resolver="linkResolver"
              />
              <div class="mt-xs text-xs text-text-3">
                {{ phrase.content_diff_after }}
              </div>
              <ContentRenderer
                :data="{ blocks: [item.block] }"
                :link-resolver="linkResolver"
              />
            </template>
          </div>
        </template>

        <template v-else>
          <template
            v-for="(segment, segmentIndex) in segments(section.blocks)"
            :key="segmentIndex"
          >
            <div
              v-if="segment.type === 'boundary'"
              class="my-xs flex items-center gap-xs text-sm text-text-3"
            >
              <Icon name="lock-close" aria-hidden="true" />
              {{ boundaryLabel(segment.block) }}
            </div>
            <ContentRenderer
              v-else
              :data="{ blocks: segment.blocks }"
              :link-resolver="linkResolver"
            />
          </template>
        </template>
      </div>
    </template>
  </div>
</template>
