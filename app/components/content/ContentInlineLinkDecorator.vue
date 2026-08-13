<script lang="ts" setup>
import {
  contentLinkReferenceFromAnchor,
  contentLinkReferenceKey,
  type ContentLinkReference,
  type ContentLinkResolver,
  type ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { iconsHref } from '#thei/icons';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';

const props = defineProps<{
  root: HTMLElement | null;
  resolver?: ContentLinkResolver;
}>();

const open = ref(false);
const anchor = ref<HTMLAnchorElement | null>(null);
const result = ref<ResolvedContentLink>();
const results = new Map<string, ResolvedContentLink>();
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
  if (!reference || !props.resolver) return;
  const key = contentLinkReferenceKey(reference);
  const cached = results.get(key);
  const resolved = cached ?? (await props.resolver(reference));
  if (resolved.state === 'resolved') results.set(key, resolved);
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
  await Promise.all(links().map((link) => resolveLink(link)));
}

function applyRuntimeState(
  link: HTMLAnchorElement,
  reference: ContentLinkReference,
  resolved: ResolvedContentLink,
) {
  link.dataset.contentLinkState = resolved.state;
  link.style.removeProperty('--content-link-icon');

  if (resolved.state === 'broken') {
    link.style.setProperty(
      '--content-link-icon',
      `url("${cssUrl(`${iconsHref}#link-broken`)}")`,
    );
    link.setAttribute('aria-invalid', 'true');
    if (reference.kind === 'project') {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.removeAttribute('rel');
    } else if (resolved.href) {
      setNavigation(link, resolved.href);
    }
    return;
  }

  link.removeAttribute('aria-invalid');
  setNavigation(link, resolved.href);
  const iconUrl = resolved.iconMedia?.previewSrc || resolved.iconMedia?.src;
  if (iconUrl)
    link.style.setProperty('--content-link-icon', `url("${cssUrl(iconUrl)}")`);
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
  observer.observe(root, { childList: true, subtree: true });
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

onBeforeUnmount(() => {
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
      flush
    />
  </FloatingPopup>
</template>
