<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import {
  contentEntityHasIcon,
  contentLinkIsRestricted,
  contentLinkReferenceFromAnchor,
  type ContentLinkReference,
  type ContentLinkResolver,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import { CONTENT_LINKS_INVALIDATED_EVENT } from '#layers/thei/app/composables/content-link-resolver';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';

const props = defineProps<{
  root: HTMLElement | null;
  playback?: MediaPlayback;
  resolver?: ContentLinkResolver;
}>();

const open = ref(false);
const anchor = ref<HTMLAnchorElement | null>(null);
const result = ref<ResolvedContentLink>();
const teleportTarget = computed(() => props.root?.closest('dialog') ?? 'body');
let observer: MutationObserver | undefined;
let requestVersion = 0;
let showTimer: ReturnType<typeof setTimeout> | undefined;
const HOVER_OPEN_DELAY = 350;

function links() {
  return Array.from(
    props.root?.querySelectorAll<HTMLAnchorElement>('a[data-content-link]') ??
      [],
  );
}

async function resolveLink(link: HTMLAnchorElement) {
  const reference = contentLinkReferenceFromAnchor(link);
  if (!reference) return;
  if (contentLinkIsRestricted(link)) {
    // The server already decided this reader may not open the target and left
    // no uuid to ask about, so there is nothing to resolve.
    const resolved: ResolvedContentLink = { ...reference, state: 'restricted' };
    applyRuntimeState(link, reference, resolved);
    return resolved;
  }
  if (!props.resolver) return;
  // The resolver remembers its answers for the page, and forgets them all
  // when told to; nothing is remembered here, so that forgetting reaches
  // every chip.
  const resolved = await props.resolver(reference);
  applyRuntimeState(link, reference, resolved);
  return resolved;
}

async function show(link: HTMLAnchorElement) {
  anchor.value = link;
  result.value = undefined;
  open.value = true;
  const version = ++requestVersion;
  const resolved = await resolveLink(link);
  if (version === requestVersion) result.value = resolved;
}

async function hydrateLinks() {
  syncHints();
  await Promise.all(links().map((link) => resolveLink(link)));
}

/**
 * Stored content names the hint in its own terms; the tooltip plugin reads
 * `data-title-popup`. Copying it here keeps the presentation mechanism out of
 * what is written to the database, and costs one pass over the same DOM the
 * links are hydrated from.
 */
function syncHints() {
  for (const hint of props.root?.querySelectorAll<HTMLElement>(
    'abbr[data-content-hint]',
  ) ?? []) {
    const text = hint.dataset.contentHint ?? '';
    if (hint.dataset.titlePopup !== text) hint.dataset.titlePopup = text;
  }
}

function applyRuntimeState(
  link: HTMLAnchorElement,
  reference: ContentLinkReference,
  resolved: ResolvedContentLink,
) {
  writeRuntimeState(link, reference, resolved);
  // What was just written is not a change to react to.
  observer?.takeRecords();
}

function writeRuntimeState(
  link: HTMLAnchorElement,
  reference: ContentLinkReference,
  resolved: ResolvedContentLink,
) {
  link.dataset.contentLinkState = resolved.state;
  delete link.dataset.contentLinkIcon;
  delete link.dataset.contentLinkMedia;
  link.style.removeProperty('--content-link-icon');
  link.style.removeProperty('--content-link-media');
  link.style.removeProperty('--content-link-media-size');
  link.style.removeProperty('--content-link-accent');

  if (resolved.state === 'broken' || resolved.state === 'restricted') {
    link.setAttribute('aria-invalid', 'true');
    if (reference.kind === 'entity') {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.removeAttribute('rel');
    } else if ('href' in resolved && resolved.href) {
      setNavigation(link, resolved.href);
    }
    return;
  }

  link.removeAttribute('aria-invalid');
  setNavigation(link, resolved.href);
  if (resolved.kind === 'entity') {
    // Every entity has a picture — its icon, the first of its body, or one
    // drawn for it. It lines the chip's left edge, and its accent tints the
    // chip.
    const picture = mediaUrl(resolved.media);
    if (picture) {
      link.dataset.contentLinkMedia = '';
      link.style.setProperty('--content-link-media', `url("${picture}")`);
      link.style.setProperty(
        '--content-link-media-size',
        chipEdgeSize(resolved.media),
      );
    }
    link.style.setProperty(
      '--content-link-accent',
      imageAccentCssColor(resolved.media?.accent),
    );
    return;
  }
  // A link elsewhere shows the site's favicon, on a surface kept neutral.
  const favicon = mediaUrl(resolved.iconMedia);
  if (favicon) {
    link.dataset.contentLinkIcon = 'image';
    link.style.setProperty('--content-link-icon', `url("${favicon}")`);
  }
}

/**
 * How the picture covers the chip's edge, which content.css draws 2.4em wide
 * and as tall as the chip (1.56em): by height when the picture is wider than
 * that, by width otherwise, so the edge is always full.
 */
function chipEdgeSize(media: { width?: number; height?: number } | undefined) {
  const ratio =
    media?.width && media.height ? media.width / media.height : undefined;
  return ratio !== undefined && ratio < 2.4 / 1.56 ? '2.4em auto' : 'auto 100%';
}

function mediaUrl(media: { previewSrc?: string; src?: string } | undefined) {
  // A style's `url()` is a DOM address the router does not own: it carries
  // the site's base path only if it is added here.
  const url = media?.previewSrc || media?.src;
  return url ? cssUrl(sitePath(url)) : undefined;
}

function setNavigation(link: HTMLAnchorElement, href: string) {
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
}

function cssUrl(value: string) {
  return value.replace(/["\\\n\r\f]/g, (character) => `\\${character}`);
}

function linkFromEvent(event: Event) {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    'a[data-content-link]',
  );
  return link && props.root?.contains(link) ? link : undefined;
}

function onPointerOver(event: Event) {
  const link = linkFromEvent(event);
  if (!link || link === anchor.value) return;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => void show(link), HOVER_OPEN_DELAY);
}

function onPointerOut(event: PointerEvent) {
  const link = linkFromEvent(event);
  if (!link) return;
  if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget))
    return;
  clearTimeout(showTimer);
  requestVersion += 1;
  open.value = false;
  anchor.value = null;
}

function onFocusIn(event: Event) {
  const link = linkFromEvent(event);
  if (link) void show(link);
}

function attach(root: HTMLElement | null) {
  observer?.disconnect();
  observer = undefined;
  if (!root) return;
  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('focusin', onFocusIn);
  observer = new MutationObserver(() => void hydrateLinks());
  // A link changes its target in place when the editor rewrites it; the
  // attributes it is made of are watched along with the nodes.
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'data-content-link',
      'data-entity-type',
      'data-entity-id',
      'data-content-note',
    ],
  });
  void hydrateLinks();
}

function onLinksInvalidated() {
  void hydrateLinks();
}

watch(
  () => props.root,
  (next, previous) => {
    previous?.removeEventListener('pointerover', onPointerOver);
    previous?.removeEventListener('pointerout', onPointerOut);
    previous?.removeEventListener('focusin', onFocusIn);
    attach(next);
  },
  { immediate: true, flush: 'post' },
);

onMounted(() => {
  document.addEventListener(
    CONTENT_LINKS_INVALIDATED_EVENT,
    onLinksInvalidated,
  );
});

onBeforeUnmount(() => {
  document.removeEventListener(
    CONTENT_LINKS_INVALIDATED_EVENT,
    onLinksInvalidated,
  );
  props.root?.removeEventListener('pointerover', onPointerOver);
  props.root?.removeEventListener('pointerout', onPointerOut);
  props.root?.removeEventListener('focusin', onFocusIn);
  clearTimeout(showTimer);
  observer?.disconnect();
});
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="anchor"
    placement="bottom-start"
    max-width="22rem"
    :teleport-to="teleportTarget"
    class="border border-border-1 bg-bg-2"
  >
    <ContentLinkPreviewCard
      :result="result"
      :label="anchor?.textContent || ''"
      :loading="!result"
      :interactive="false"
      :playback
      :continuous-project-media="
        result?.kind === 'entity' && contentEntityHasIcon(result.entityType)
      "
      flush
    />
  </FloatingPopup>
</template>
