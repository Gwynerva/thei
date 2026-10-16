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
import ReviewWords from './ReviewWords.vue';
import { reviewPartIcon } from './review';

/**
 * The text as a review shows it, block by block as the renderer draws it:
 * words a part changes marked where they stand, a block a part is tinted,
 * words outside the running text and whole blocks marked on the margin — or,
 * on a phone, in a line over the block — and a block that would go folded to
 * a line. Whatever is marked opens its part, a part left as it was too.
 */
const props = defineProps<{
  rows: ReviewRow[];
  parts: ReadonlyMap<string, ReviewPart>;
  decisions: Readonly<Record<string, ReviewDecision>>;
  view: ReviewView;
  mode: 'ai' | 'version';
  /** The part in hand, once the owner goes through them. */
  current?: string;
  linkResolver?: ContentLinkResolver;
}>();
const emit = defineEmits<{ pick: [id: string, anchor: HTMLElement] }>();

const root = useTemplateRef<HTMLElement>('root');
const words = computed(() => phrase.value.ai_review_modes[props.mode]);

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

/** Parts that bring a block: folded, it is one left out, not one gone. */
const BRINGS = new Set<ReviewPart['kind']>(['added', 'heading', 'delimiter']);

function goneLabel(id: string) {
  const part = props.parts.get(id);
  if (part && BRINGS.has(part.kind)) return phrase.value.ai_review_not_added;
  return stateOf(id) === 'accepted'
    ? phrase.value.ai_review_gone_taken
    : phrase.value.ai_review_gone;
}

/**
 * Each row's key: its part, or its block, so a row shifted by a decision is
 * the same row, not another block drawn into it.
 */
const keys = computed(() => {
  const used = new Map<string, number>();
  return props.rows.map((row, index) => {
    const base =
      row.type === 'edge'
        ? `edge:${index}`
        : row.type === 'gone'
          ? `gone:${row.part}`
          : `${row.was ? 'was:' : ''}${row.part ?? ''}:${row.block.id ?? index}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen ? `${base}#${seen}` : base;
  });
});

/**
 * In «what goes and what comes», a block shown twice — as it is, then as it
 * would be — says which is which.
 */
function sideOf(index: number): 'was' | 'will' | undefined {
  const row = props.rows[index];
  if (props.view !== 'diff' || row?.type !== 'block' || !row.part) return;
  if (row.was) return 'was';
  const before = props.rows[index - 1];
  return before?.type === 'block' && before.was && before.part === row.part
    ? 'will'
    : undefined;
}

// ---- Marks in the running text ---------------------------------------------------

const MARKS = Object.values(REVIEW_MARK).join('');

/** The marks' characters in a row, in order, each with where it stands. */
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
 * A mark the renderer broke apart is not made: its opening goes, and with
 * it the part's id it carries, so no stray letters stay in the words.
 */
function dropBrokenOpening(open: { node: Text; offset: number }) {
  const rest = open.node.data.slice(open.offset + 1);
  const idEnd = rest.indexOf(REVIEW_MARK.id);
  const id = idEnd === -1 ? rest.match(/^[\w-]*/)![0] : rest.slice(0, idEnd);
  const length = 1 + id.length + (idEnd === -1 ? 0 : 1);
  open.node.deleteData(open.offset, length);
}

/** Turns the marks a row carries into elements that open their parts. */
function decorateRow(container: HTMLElement) {
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
      dropBrokenOpening(open!);
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
}

/**
 * Every row's marks, each row on its own: the renderer draws its own markup,
 * never Vue's, so changing it here is safe, and a row drawn anew comes back
 * with its marks to turn again.
 */
function decorate() {
  for (const row of root.value?.querySelectorAll<HTMLElement>(
    '[data-review-row]',
  ) ?? [])
    decorateRow(row);
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

// Turned once drawn, within the same flush: whoever waits for the next tick
// — the way on to the next part — finds every mark made.
onMounted(decorate);
watch(() => [props.rows, props.view], decorate, { flush: 'post' });
watch(() => [props.current, props.decisions], paint, {
  deep: true,
  flush: 'post',
});

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
    <template v-for="(row, index) in rows" :key="keys[index]">
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
        :data-review-left="
          parts.get(row.part)?.kind === 'removed' ||
          parts.get(row.part)?.kind === 'removal'
            ? undefined
            : ''
        "
        :aria-label="label(row.part)"
      >
        <Icon name="minus" class="shrink-0" />
        <b class="shrink-0 font-semibold">{{ goneLabel(row.part) }}</b>
        <span v-if="row.quote" class="min-w-0 flex-1 truncate italic"
          >«{{ publicText(row.quote) }}»</span
        >
      </button>

      <div
        v-else
        class="relative"
        :class="{ 'review-tint': row.part }"
        :data-review-block="row.part"
        :data-state="row.part ? stateOf(row.part) : undefined"
        :data-side="sideOf(index)"
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
        <!-- Shown twice, a block says which state each is. -->
        <p
          v-if="sideOf(index)"
          class="review-side mb-1 text-2xs font-bold tracking-wide uppercase"
          :data-side="sideOf(index)"
        >
          {{ sideOf(index) === 'was' ? words.was : words.will }}
        </p>

        <ReviewWords v-if="row.diff" :block="row.block" :diff="row.diff" />
        <ContentRenderer
          v-else
          :data="{ blocks: [row.block] }"
          :link-resolver
          spoilers-open
          :class="{ 'review-was': row.was }"
          data-review-row
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

/*
 * A whole block a part is: tinted while it waits, edged once decided — in
 * green when taken, in grey when left as it was.
 */
.review-tint {
  margin-inline: calc(var(--spacing) * -3);
  border-radius: var(--radius-normal);
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3);
  background: color-mix(in oklab, var(--color-accent) 7%, transparent);
  box-shadow: inset 3px 0 0 var(--color-accent);
  transition:
    background-color var(--default-transition-duration),
    box-shadow var(--default-transition-duration);
}
.review-tint[data-state='accepted'] {
  background: transparent;
  box-shadow: inset 3px 0 0 var(--color-text-success);
}
.review-tint[data-state='kept'] {
  background: transparent;
  box-shadow: inset 3px 0 0 var(--color-border-2);
}
/* The two states of a block shown twice: what is, struck, and what comes. */
.review-tint[data-side='was'] {
  background: color-mix(in oklab, var(--color-text-error) 6%, transparent);
  box-shadow: inset 3px 0 0 var(--color-text-error);
}
.review-tint[data-side='will'] {
  background: color-mix(in oklab, var(--color-text-success) 6%, transparent);
  box-shadow: inset 3px 0 0 var(--color-text-success);
}
.review-side[data-side='was'] {
  color: var(--color-text-error);
}
.review-side[data-side='will'] {
  color: var(--color-text-success);
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
.review-was :deep(:is(img, video)) {
  filter: grayscale(0.6);
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
/* A block a part would bring, left out: grey, as what is left as it was. */
.review-gone[data-review-left] {
  border-color: var(--color-border-2);
  color: var(--color-text-2);
}
</style>
