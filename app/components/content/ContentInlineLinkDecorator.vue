<script lang="ts" setup>
import type { MediaPlayback } from '#layers/thei/shared/media';
import {
  contentEntityHasIcon,
  contentLinkIsRestricted,
  contentLinkReferenceFromAnchor,
  withLinkFragment,
  type ContentLinkReference,
  type ContentLinkResolver,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import { CONTENT_LINKS_INVALIDATED_EVENT } from '#layers/thei/app/composables/content-link-resolver';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';
import LinkHoverPopup from '../LinkHoverPopup.vue';

const props = defineProps<{
  root: HTMLElement | null;
  playback?: MediaPlayback;
  resolver?: ContentLinkResolver;
}>();

const result = ref<ResolvedContentLink>();
let observer: MutationObserver | undefined;
let requestVersion = 0;

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

/** The popup opened over a link: what it opens is asked about afresh. */
async function show(link: HTMLAnchorElement) {
  result.value = undefined;
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
 * links are hydrated from. The hint is the owner's words, so the tooltip gets
 * their typography; the stored attribute keeps them as typed.
 */
function syncHints() {
  for (const hint of props.root?.querySelectorAll<HTMLElement>(
    'abbr[data-content-hint]',
  ) ?? []) {
    const text = publicText(hint.dataset.contentHint);
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

/** An attribute set to a value, or taken off, only when it differs. */
function setAttribute(element: HTMLElement, name: string, value?: string) {
  if (value === undefined) {
    if (element.hasAttribute(name)) element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value)
    element.setAttribute(name, value);
}

/** A style property set, or taken off, only when it differs. */
function setStyle(element: HTMLElement, property: string, value?: string) {
  if (element.style.getPropertyValue(property) === (value ?? '')) return;
  if (value === undefined) element.style.removeProperty(property);
  else element.style.setProperty(property, value);
}

/**
 * What a link shows of its target, written only where it differs: in the
 * editor, every attribute written wakes Editor.js to read the whole text.
 */
function writeRuntimeState(
  link: HTMLAnchorElement,
  reference: ContentLinkReference,
  resolved: ResolvedContentLink,
) {
  setAttribute(link, 'data-content-link-state', resolved.state);
  let picture: string | undefined;
  let size: string | undefined;
  let accent: string | undefined;
  let favicon: string | undefined;

  if (resolved.state === 'broken' || resolved.state === 'restricted') {
    setAttribute(link, 'aria-invalid', 'true');
    if (reference.kind === 'entity')
      for (const name of ['href', 'target', 'rel']) setAttribute(link, name);
    else if ('href' in resolved && resolved.href)
      setNavigation(link, resolved.href);
  } else {
    setAttribute(link, 'aria-invalid');
    setNavigation(link, resolved.href);
    if (resolved.kind === 'entity') {
      // Every entity has a picture — its icon, the first of its body, or one
      // drawn for it. It lines the chip's left edge, and its accent tints the
      // chip.
      picture = mediaUrl(resolved.media);
      if (picture) size = chipEdgeSize(resolved.media);
      accent = imageAccentCssColor(resolved.media?.accent);
    } else {
      // A link elsewhere shows the site's favicon, on a surface kept neutral.
      favicon = mediaUrl(resolved.iconMedia);
    }
  }
  setAttribute(link, 'data-content-link-media', picture ? '' : undefined);
  setStyle(link, '--content-link-media', picture);
  setStyle(link, '--content-link-media-size', size);
  setStyle(link, '--content-link-accent', accent);
  setAttribute(link, 'data-content-link-icon', favicon ? 'image' : undefined);
  setStyle(link, '--content-link-icon', favicon);
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
  return url ? siteCssUrl(url) : undefined;
}

/**
 * Where a link opens: its target's address — leading, for an entity, to the
 * place inside it the link names — with the site's base path, since an
 * `href` written here is an attribute the router does not own.
 */
function setNavigation(link: HTMLAnchorElement, href: string) {
  const fragment =
    link.dataset.contentLink === 'entity'
      ? link.dataset.entityFragment
      : undefined;
  setAttribute(link, 'href', sitePath(withLinkFragment(href, fragment)));
  setAttribute(link, 'target', '_blank');
  setAttribute(link, 'rel', 'noopener noreferrer');
}

/** Markup a node is or holds, looked for in what came and went. */
const MARKUP = 'a[data-content-link], abbr[data-content-hint]';

/**
 * Whether a change touched a link or a hint: words typed, the editor's own
 * marks drawn round the caret, ask for nothing.
 */
function concernsMarkup(record: MutationRecord) {
  if (record.type === 'attributes') return true;
  return [...record.addedNodes, ...record.removedNodes].some(
    (node) =>
      node instanceof Element &&
      (node.matches(MARKUP) || Boolean(node.querySelector(MARKUP))),
  );
}

function attach(root: HTMLElement | null) {
  observer?.disconnect();
  observer = undefined;
  if (!root) return;
  observer = new MutationObserver((records) => {
    if (records.some(concernsMarkup)) void hydrateLinks();
  });
  // A link changes its target in place when the editor rewrites it, and a
  // hint what it says; the attributes they are made of are watched along
  // with the nodes.
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'data-content-link',
      'data-entity-type',
      'data-entity-id',
      'data-entity-fragment',
      'data-content-note',
      'data-content-hint',
    ],
  });
  void hydrateLinks();
}

function onLinksInvalidated() {
  void hydrateLinks();
}

watch(() => props.root, attach, { immediate: true, flush: 'post' });

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
  observer?.disconnect();
});
</script>

<template>
  <LinkHoverPopup
    v-slot="{ anchor }"
    :root
    selector="a[data-content-link]"
    @show="show($event as HTMLAnchorElement)"
    @hide="requestVersion += 1"
  >
    <!-- The note is not in the text, where the link only mentions its
         target: it is read here, under the card. -->
    <ContentLinkPreviewCard
      :result="result"
      :label="anchor.textContent || ''"
      :note="anchor.dataset.contentNote"
      :loading="!result"
      :interactive="false"
      :playback
      :continuous-project-media="
        result?.kind === 'entity' && contentEntityHasIcon(result.entityType)
      "
      flush
    />
  </LinkHoverPopup>
</template>
