<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import {
  REVIEW_MARK,
  type ReviewDecision,
  type ReviewPart,
  type ReviewRow,
  type ReviewView,
} from '#layers/thei/shared/content-review';
import ContentRenderer from '#layers/thei/app/components/content/ContentRenderer.vue';
import { reviewPartIcon } from './review';

/**
 * The text as a review shows it, block by block as the renderer draws it:
 * words a part changes marked where they stand, a block a part is tinted,
 * words outside the running text and whole blocks marked on the margin — or,
 * on a phone, in a line over the block — and a block that would go folded to
 * a line. Whatever is marked opens its part.
 */
const props = defineProps<{
  rows: ReviewRow[];
  parts: ReadonlyMap<string, ReviewPart>;
  decisions: Readonly<Record<string, ReviewDecision>>;
  view: ReviewView;
  /** The part in hand, once the owner goes through them. */
  current?: string;
  linkResolver?: ContentLinkResolver;
}>();
const emit = defineEmits<{ pick: [id: string, anchor: HTMLElement] }>();

const root = useTemplateRef<HTMLElement>('root');

function stateOf(id: string): ReviewDecision {
  return props.decisions[id] ?? 'pending';
}

function label(id: string) {
  const part = props.parts.get(id);
  if (!part) return '';
  const kind = phrase.value.ai_review_kinds[part.kind];
  return part.sure ? kind : `${kind} · ${phrase.value.ai_review_unsure}`;
}

/** What a row has on its margin: the part it is, and parts inside it. */
function marginOf(row: Extract<ReviewRow, { type: 'block' }>) {
  return [...(row.part ? [row.part] : []), ...row.parts];
}

const edgeLabel = (edge: 'start' | 'end') =>
  edge === 'end'
    ? phrase.value.content_private_section_end
    : phrase.value.content_private_section_start;

// ---- Marks in the running text ---------------------------------------------------

const MARKS = Object.values(REVIEW_MARK).join('');

/** The marks' characters in the text, in order, each with where it stands. */
function markCharacters(container: HTMLElement) {
  const found: { node: Text; offset: number; char: string }[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (let offset = 0; offset < text.data.length; offset++)
      if (MARKS.includes(text.data[offset]!))
        found.push({ node: text, offset, char: text.data[offset]! });
  }
  return found;
}

function rangeBetween(
  from: { node: Text; offset: number },
  to: { node: Text; offset: number },
) {
  const range = document.createRange();
  range.setStart(from.node, from.offset + 1);
  range.setEnd(to.node, to.offset);
  return range;
}

/**
 * Turns the marks the text carries into elements that open their parts. The
 * text the renderer drew is its own markup, never Vue's, so changing it here
 * is safe: a block drawn anew comes back with its marks to turn again.
 */
function decorate() {
  const container = root.value;
  if (!container) return;
  for (;;) {
    const chars = markCharacters(container);
    const start = chars.findLastIndex((char) => char.char === REVIEW_MARK.open);
    if (start === -1) break;
    const [open, idEnd, ...rest] = chars.slice(start);
    // Its own characters only: what a broken mark after it left is no part
    // of it.
    const closeAt = rest.findIndex((char) => char.char === REVIEW_MARK.close);
    const close = rest[closeAt];
    if (
      !open ||
      idEnd?.char !== REVIEW_MARK.id ||
      !close ||
      idEnd.node !== open.node
    ) {
      // A mark the renderer broke apart is not made; its characters go below.
      open!.node.deleteData(open!.offset, 1);
      continue;
    }
    const id = open.node.data.slice(open.offset + 1, idEnd.offset);
    const inside = rest.slice(0, closeAt);
    const was = inside.find((char) => char.char === REVIEW_MARK.was);
    const becomes = inside.find((char) => char.char === REVIEW_MARK.becomes);

    const outer = document.createRange();
    outer.setStart(open.node, open.offset);
    outer.setEnd(close.node, close.offset + 1);
    const mark = document.createElement('span');
    mark.className = 'review-mark';
    mark.dataset.reviewPart = id;
    mark.setAttribute('role', 'button');
    mark.tabIndex = 0;
    mark.setAttribute('aria-label', label(id));
    mark.dataset.titlePopup = label(id);
    if (was && becomes) {
      const after = rangeBetween(becomes, close);
      const before = rangeBetween(was, becomes);
      const ins = document.createElement('ins');
      ins.append(after.extractContents());
      const del = document.createElement('del');
      del.append(before.extractContents());
      mark.append(del, ins);
    } else mark.append(rangeBetween(idEnd, close).extractContents());
    outer.deleteContents();
    outer.insertNode(mark);
  }
  // Whatever is left of a broken mark is not shown.
  for (const char of markCharacters(container).reverse())
    char.node.deleteData(char.offset, 1);
  paint();
}

/** Each mark says how its part stands, and which is in hand. */
function paint() {
  for (const element of root.value?.querySelectorAll<HTMLElement>(
    '[data-review-part]',
  ) ?? []) {
    const id = element.dataset.reviewPart!;
    const part = props.parts.get(id);
    element.dataset.state = stateOf(id);
    element.dataset.sure = String(part?.sure ?? true);
    if (id === props.current) element.dataset.current = '';
    else delete element.dataset.current;
  }
}

watch(
  () => [props.rows, props.view],
  () => nextTick(decorate),
  { immediate: true },
);
watch(
  () => [props.current, props.decisions],
  () => nextTick(paint),
  {
    deep: true,
  },
);
onMounted(decorate);

function pick(event: Event) {
  const element = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-review-part]',
  );
  if (!element || !root.value?.contains(element)) return;
  event.preventDefault();
  emit('pick', element.dataset.reviewPart!, element);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  pick(event);
}

/** A part's mark on the margin, and its icon. */
function marginIcon(id: string): IconName {
  const part = props.parts.get(id);
  return part ? reviewPartIcon(part) : 'text';
}

defineExpose({
  /** The element a part is marked by, to open it at. */
  anchorOf(id: string) {
    const all = [
      ...(root.value?.querySelectorAll<HTMLElement>(
        `[data-review-part="${CSS.escape(id)}"]`,
      ) ?? []),
    ];
    return all.find((element) => element.offsetParent !== null) ?? all[0];
  },
});
</script>

<template>
  <div
    ref="root"
    class="review-doc flex flex-col gap-md"
    :data-view="view"
    data-review-document
    @click="pick"
    @keydown="onKeydown"
  >
    <template v-for="(row, index) in rows" :key="index">
      <div
        v-if="row.type === 'edge'"
        class="flex items-center gap-xs text-sm text-text-3"
      >
        <Icon name="lock-close" aria-hidden="true" />{{ edgeLabel(row.edge) }}
      </div>

      <button
        v-else-if="row.type === 'gone'"
        type="button"
        class="review-gone flex w-full min-w-0 cursor-pointer items-center gap-2
          rounded-normal border border-dashed px-2.5 py-1.5 text-left text-sm
          pointer-coarse:min-h-11"
        :data-review-part="row.part"
        :aria-label="label(row.part)"
      >
        <Icon name="minus" class="shrink-0" />
        <b class="shrink-0 font-semibold">{{
          stateOf(row.part) === 'accepted'
            ? phrase.ai_review_gone_taken
            : phrase.ai_review_gone
        }}</b>
        <span class="min-w-0 flex-1 truncate italic">«{{ row.quote }}»</span>
      </button>

      <div
        v-else
        class="relative"
        :class="{ 'review-tint': row.part }"
        :data-review-block="row.part"
        :data-state="row.part ? stateOf(row.part) : undefined"
      >
        <!-- On the margin from sm up; over the block on a phone. -->
        <div
          v-if="marginOf(row).length"
          class="absolute top-0.5 -left-12 hidden flex-col gap-1.5 sm:flex"
        >
          <button
            v-for="id in marginOf(row)"
            :key="id"
            type="button"
            class="review-rail flex size-7.5 cursor-pointer items-center
              justify-center rounded-full border text-base"
            :data-review-part="id"
            :aria-label="label(id)"
            :data-title-popup="label(id)"
          >
            <Icon :name="marginIcon(id)" />
          </button>
        </div>
        <div
          v-if="marginOf(row).length"
          class="mb-1.5 flex flex-wrap gap-1.5 sm:hidden"
        >
          <button
            v-for="id in marginOf(row)"
            :key="id"
            type="button"
            class="review-rail flex h-7 cursor-pointer items-center gap-1
              rounded-full border px-2 text-xs font-semibold pointer-coarse:h-9"
            :data-review-part="id"
          >
            <Icon :name="marginIcon(id)" />{{ label(id) }}
          </button>
        </div>

        <p
          v-if="row.diff"
          class="leading-relaxed whitespace-pre-line"
          :class="{ 'text-lg font-semibold': row.block.type === 'header' }"
        >
          <template v-for="(words, wordsIndex) in row.diff" :key="wordsIndex"
            ><del v-if="words.kind === 'removed'">{{ words.text }}</del
            ><ins v-else-if="words.kind === 'added'">{{ words.text }}</ins
            ><template v-else>{{ words.text }}</template></template
          >
        </p>
        <ContentRenderer
          v-else
          :data="{ blocks: [row.block] }"
          :link-resolver
          :class="{ 'review-was': row.was }"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* A word a part changes: how its part stands, in a line under it. */
.review-doc :deep(.review-mark) {
  cursor: pointer;
  border-radius: 2px;
  text-decoration-line: underline;
  text-decoration-color: var(--color-accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
  transition: background-color var(--default-transition-duration);
}
.review-doc :deep(.review-mark[data-sure='false'][data-state='pending']) {
  text-decoration-style: wavy;
  text-decoration-color: var(--color-text-warning);
  text-decoration-thickness: 1.5px;
}
.review-doc :deep(.review-mark[data-state='accepted']) {
  text-decoration-color: color-mix(
    in oklab,
    var(--color-text-success) 55%,
    transparent
  );
  text-decoration-thickness: 1.5px;
}
.review-doc :deep(.review-mark[data-state='kept']) {
  text-decoration-style: dotted;
  text-decoration-color: var(--color-text-3);
  text-decoration-thickness: 1.5px;
}
.review-doc :deep(.review-mark[data-current]) {
  background: color-mix(in oklab, var(--color-accent) 18%, transparent);
  box-shadow: 0 0 0 3px
    color-mix(in oklab, var(--color-accent) 18%, transparent);
}
.review-doc[data-view='diff'] :deep(.review-mark) {
  text-decoration-line: none;
}
.review-doc :deep(del) {
  border-radius: 3px;
  padding: 0 0.1em;
  background: var(--color-bg-error);
  color: var(--color-text-error);
  text-decoration-line: line-through;
  text-decoration-thickness: 1px;
}
.review-doc :deep(ins) {
  border-radius: 3px;
  padding: 0 0.1em;
  background: var(--color-bg-success);
  color: var(--color-text-success);
  text-decoration: none;
}

/* A whole block a part is: tinted while it waits, edged once decided. */
.review-tint {
  margin-inline: calc(var(--spacing) * -3);
  border-radius: var(--radius-normal);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  background: color-mix(in oklab, var(--color-accent) 7%, transparent);
  box-shadow: inset 3px 0 0 var(--color-accent);
}
.review-tint[data-state='accepted'] {
  background: transparent;
  box-shadow: inset 3px 0 0 var(--color-text-success);
}
.review-was {
  opacity: 0.75;
  text-decoration-line: line-through;
  text-decoration-color: color-mix(
    in oklab,
    var(--color-text-error) 60%,
    transparent
  );
}

/* Marks on the margin, and a block folded to a line. */
.review-rail {
  border-color: var(--color-border-2);
  background: var(--color-bg-1);
  color: var(--color-text-2);
}
.review-rail[data-state='pending'] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.review-rail[data-state='pending'][data-sure='false'] {
  border-color: var(--color-text-warning);
  color: var(--color-text-warning);
}
.review-rail[data-state='accepted'] {
  border-color: var(--color-border-success);
  background: var(--color-bg-success);
  color: var(--color-text-success);
}
.review-rail[data-state='kept'] {
  opacity: 0.5;
}
.review-rail[data-current],
.review-gone[data-current] {
  box-shadow: 0 0 0 3px
    color-mix(in oklab, var(--color-accent) 35%, transparent);
}
.review-gone {
  border-color: color-mix(in oklab, var(--color-text-error) 45%, transparent);
  background: transparent;
  color: var(--color-text-error);
}
.review-gone[data-state='accepted'] {
  opacity: 0.55;
}
</style>
