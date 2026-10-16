<script lang="ts" setup>
/**
 * A Markdown file read as the page it describes: headings, lists, tables,
 * code, pictures from other sites. The parser comes with the first such file
 * opened; the HTML it makes is rebuilt from known elements alone.
 */
const props = defineProps<{ text: string }>();

const article = useTemplateRef<HTMLElement>('article');
let run = 0;

async function render() {
  const mine = ++run;
  const { renderMarkdown } =
    await import('#layers/thei/app/composables/file-preview/markdown');
  if (mine !== run || !article.value) return;
  article.value.replaceChildren(renderMarkdown(props.text));
}

onMounted(render);
watch(() => props.text, render);

/** A heading's name as a link inside the text points at it, GitHub's way. */
function slug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * A link to a part of the text scrolls there inside the file. The page's
 * address is never touched: a step in its history would read as Back and
 * close the window.
 */
function onClick(event: MouseEvent) {
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
      : null;
  if (!link || !article.value?.contains(link)) return;
  event.preventDefault();
  let wanted = link.getAttribute('href')!.slice(1);
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    // Not an encoded name: read as it is.
  }
  const heading = [
    ...article.value.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
  ].find((element) => slug(element.textContent ?? '') === slug(wanted));
  heading?.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
}
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
      <article
        ref="article"
        class="file-markdown mx-auto max-w-180 p-md text-text-1"
        data-file-preview-markdown
        @click="onClick"
      ></article>
    </div>
  </div>
</template>

<style scoped>
.file-markdown {
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.file-markdown > :deep(*) {
  margin-block: 0;
}

.file-markdown > :deep(* + *) {
  margin-top: 0.9em;
}

.file-markdown :deep(:is(h1, h2, h3, h4, h5, h6)) {
  margin-top: 1.4em;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.file-markdown > :deep(:first-child) {
  margin-top: 0;
}

.file-markdown :deep(h1) {
  font-size: 1.75rem;
}

.file-markdown :deep(h2) {
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--color-border-1);
  font-size: 1.4rem;
}

.file-markdown :deep(h3) {
  font-size: 1.15rem;
}

.file-markdown :deep(:is(h4, h5, h6)) {
  font-size: 1rem;
}

.file-markdown :deep(a) {
  color: var(--color-accent);
  text-decoration-line: underline;
  text-decoration-color: color-mix(
    in oklab,
    var(--color-accent) 40%,
    transparent
  );
  text-underline-offset: 0.15em;
  transition: text-decoration-color var(--default-transition-duration)
    var(--default-transition-timing-function);
}

@media (hover: hover) {
  .file-markdown :deep(a:hover) {
    text-decoration-color: var(--color-accent);
  }
}

.file-markdown :deep(:is(ul, ol)) {
  padding-left: 1.5em;
}

.file-markdown :deep(ul) {
  list-style: disc;
}

.file-markdown :deep(ol) {
  list-style: decimal;
}

.file-markdown :deep(li + li) {
  margin-top: 0.25em;
}

.file-markdown :deep(li:has(> input[type='checkbox'])) {
  margin-left: -1.3em;
  list-style: none;
}

.file-markdown :deep(input[type='checkbox']) {
  margin-right: 0.45em;
  vertical-align: -0.1em;
  accent-color: var(--color-accent);
}

.file-markdown :deep(blockquote) {
  padding-left: 1em;
  border-left: 3px solid var(--color-border-2);
  color: var(--color-text-2);
}

.file-markdown :deep(:not(pre) > code) {
  padding: 0.1em 0.35em;
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--color-bw-reverse) 7%, transparent);
  font-family: var(--font-mono);
  font-size: 0.875em;
}

.file-markdown :deep(pre) {
  padding: var(--spacing-sm);
  overflow-x: auto;
  border: 1px solid var(--color-border-1);
  border-radius: var(--radius-normal);
  background: color-mix(in oklab, var(--color-bw-reverse) 4%, transparent);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.55;
  overflow-wrap: normal;
  white-space: pre;
}

.file-markdown :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.file-markdown :deep(:is(th, td)) {
  padding: 0.35em 0.65em;
  border: 1px solid var(--color-border-1);
  text-align: left;
  vertical-align: top;
  overflow-wrap: normal;
}

/* Islands on the document's own tint: a shade of it, in either theme. */
.file-markdown :deep(th) {
  background: color-mix(in oklab, var(--color-bw-reverse) 4%, transparent);
  font-weight: 600;
}

.file-markdown :deep(:is(th, td)[align='center']) {
  text-align: center;
}

.file-markdown :deep(:is(th, td)[align='right']) {
  text-align: right;
}

.file-markdown :deep(img) {
  display: inline-block;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.file-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--color-border-1);
}

.file-markdown :deep(:is(strong, b)) {
  font-weight: 700;
}

.file-markdown :deep(:is(em, i)) {
  font-style: italic;
}

.file-markdown :deep(:is(del, s)) {
  text-decoration-line: line-through;
}

.file-markdown :deep(:is(sup, sub)) {
  font-size: 0.75em;
}

.file-markdown :deep(kbd) {
  padding: 0 0.3em;
  border: 1px solid var(--color-border-2);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--color-bw-reverse) 4%, transparent);
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.file-markdown :deep(mark) {
  background: var(--color-bg-warning);
  color: inherit;
}

.file-markdown :deep(details) {
  padding: 0.5em 0.75em;
  border: 1px solid var(--color-border-1);
  border-radius: var(--radius-normal);
}

.file-markdown :deep(summary) {
  cursor: pointer;
  font-weight: 600;
}
</style>
