<script lang="ts" setup>
import {
  externalLinkAddress,
  externalLinkHostname,
  normalizeExternalLinkUrl,
  type ExternalLinkPreview,
} from '#layers/thei/shared/external-link';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type { MediaPlayback } from '#layers/thei/shared/media';
import LinkPreviewCard from '#layers/thei/app/components/LinkPreviewCard.vue';

/**
 * The card of a link to another site (`LinkPreviewCard`): the site's title
 * after a globe, its description, the owner's note on why the link is there
 * (`note`, or the `note` slot, where the editor writes one) and, last, the
 * address it leads to. The site's favicon stands on the edge over its own
 * blurred copy, and its colour is the card's under a pointer.
 */
const props = defineProps<{
  link?: ExternalLinkPreview;
  url?: string;
  /** The owner's note, as typed. */
  note?: string;
  loading?: boolean;
  errorText?: string;
  loadingText?: string;
  /** Laid on a popup's surface: no border or ground of its own. */
  flush?: boolean;
  /** For a narrow popup: a thinner picture, so the text keeps its room. */
  compact?: boolean;
  interactive: boolean;
  playback?: MediaPlayback;
}>();
const slots = defineSlots<{ note?(): unknown }>();

/** The site said nothing of itself, and reading it failed just now. */
const failed = computed(() => !props.link?.title && Boolean(props.errorText));
/**
 * The address the card is of: the one it was given by itself — in a form,
 * what the owner has typed, which the record beside it may still lag behind
 * — else the record's. Its name, its last line and where it leads all read
 * this one.
 */
const target = computed(() => props.url || props.link?.url || '');
const hostname = computed(() => externalLinkHostname(target.value));
const title = computed(
  () => props.link?.title || props.errorText || hostname.value,
);
const address = computed(() =>
  target.value ? externalLinkAddress(target.value) : undefined,
);
const summary = computed(
  () =>
    props.link?.description || (props.loading ? props.loadingText : undefined),
);
const iconMedia = computed(() => props.link?.faviconMedia);

/**
 * How the details were obtained, when that is worth knowing: a site that
 * did not answer can be refreshed later. Public data never carries a
 * status, so visitors never see this line. It is set upright and in colour,
 * so it never reads as the owner's italic note.
 */
const hint = computed(() => {
  if (props.link?.status === 'fallback')
    return {
      text: phrase.value.external_link_fallback,
      tone: 'text-text-error',
    };
  if (props.link?.status === 'archived')
    return {
      text: phrase.value.external_link_archived,
      tone: 'text-text-warning',
    };
  return undefined;
});

const href = computed(() => {
  try {
    return normalizeExternalLinkUrl(target.value);
  } catch {
    return undefined;
  }
});

const accentColor = computed(() =>
  imageAccentCssColor(iconMedia.value?.accent, 'var(--color-text-3)'),
);
</script>

<template>
  <LinkPreviewCard
    class="external-link-preview"
    :kind="{ icon: 'globe', label: phrase.content_external_link }"
    :title
    :title-error="failed"
    :summary
    :note
    :address
    :mark="{ media: iconMedia, icon: 'globe' }"
    :accent="accentColor"
    :href
    :interactive
    :loading
    :playback
    :flush
    :compact
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
    <template v-if="hint && !loading" #hint>
      <span class="text-xs" :class="hint.tone">{{ hint.text }}</span>
    </template>
  </LinkPreviewCard>
</template>
