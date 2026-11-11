<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';

/**
 * The one card a link is shown as, whatever it leads to — an entity of the
 * site, another site, a target that is gone, closed or still asked about —
 * and wherever it stands: a link block in a text, the popup over a link, a
 * chip or a row.
 *
 * A pale line over the title names what the target belongs to, and is there
 * only when it belongs to something: a section's project, an excerpt's
 * parent. The title follows the glyph of the target's kind, which says the
 * kind without a word; then two lines of its description, the owner's note
 * on the link (`note`, or the `note` slot) and, last, a site's address,
 * pale and cut where it runs out of room.
 *
 * A target with a picture shows it along the right edge. One with only a
 * small sign of its own — a site's favicon — stands it there at a size of
 * its own, over its own blurred copy (`mark`): stretched to the edge it
 * would be a blur. A favicon is ringed twice, light and then dark, so that
 * a black one shows on a dark ground and a white one on a light one,
 * whatever the theme; nothing of the site's own — a glyph, a drawn icon, a
 * project's icon — is ever ringed or backed for legibility: those are made
 * for its grounds. A target with neither is not left bare: the glyph of its
 * kind stands on the edge, large, on a wash of the card's accent — a tag's
 * own colour, or the site's. The cards of the kinds (`EntityLinkPreviewCard`,
 * `ExternalLinkPreviewCard`, `ContentLinkPreviewCard`) only say what goes
 * into these lines.
 */
const props = defineProps<{
  /**
   * What the target is: the glyph of its kind, and the kind's name, which
   * only a screen reader says. Without a name the glyph is hidden from it:
   * for a card whose words already say what the glyph would.
   */
  kind: { icon: IconName; label?: string };
  /**
   * What the target belongs to, from the outermost in; `icon` is the glyph
   * of that thing's kind.
   */
  parents?: { icon?: IconName; label: string }[];
  /** As it is to be read: already formatted. */
  title: string;
  summary?: string;
  /** A quotation rather than a description, as a diary entry's lines are. */
  summaryItalic?: boolean;
  /** The owner's note, as typed. */
  note?: string;
  /** Another site's address, as a reader reads it: the card's last line. */
  address?: string;
  media?: MediaDescriptor;
  /**
   * A small sign in place of a picture: a favicon at its own size, or the
   * glyph while there is none.
   */
  mark?: { media?: MediaDescriptor; icon: IconName };
  /** The colour the card takes under a pointer, in place of the site's accent. */
  accent?: string;
  href?: string;
  interactive: boolean;
  /** `error` for a link that leads nowhere, `muted` for one that is closed. */
  tone?: 'error' | 'muted';
  /** Only the title says something went wrong. */
  titleError?: boolean;
  /** The target is still being asked about. */
  loading?: boolean;
  playback?: MediaPlayback;
  /** Laid on a popup's surface: no border or ground of its own. */
  flush?: boolean;
  /** For a narrow popup: a thinner picture, so the text keeps its room. */
  compact?: boolean;
  loop?: boolean;
  autoplayReducedMotion?: boolean;
}>();
defineSlots<{ note?(): unknown; hint?(): unknown }>();
const { engaged, events: mediaEvents } = useMediaInteraction();
const link = computed(() => (props.interactive ? props.href : undefined));
/**
 * What stands on the edge of a card with no picture: the sign it was given,
 * else the glyph of its kind. A link that leads nowhere has neither.
 */
const sign = computed(() =>
  props.media
    ? undefined
    : (props.mark ?? (props.tone ? undefined : { icon: props.kind.icon })),
);
/** A still of the sign, which its blurred copy is drawn from. */
const signStill = computed(() => {
  const media = sign.value?.media;
  return media ? sitePath(media.previewSrc || media.src) : undefined;
});
</script>

<template>
  <component
    v-on="mediaEvents"
    :is="link ? 'a' : 'div'"
    :href="link"
    :tabindex="playback === 'interaction' && !link ? 0 : undefined"
    :target="link ? '_blank' : undefined"
    :rel="link ? 'noopener noreferrer' : undefined"
    class="link-preview group relative flex w-full min-w-0 items-center gap-xs
      overflow-hidden no-underline transition-colors"
    :class="[
      { 'link-preview-interactive cursor-pointer': link },
      compact ? 'min-h-16' : 'min-h-18',
      tone === 'error'
        ? 'text-text-error'
        : tone === 'muted'
          ? 'text-text-3'
          : 'text-text-1',
      flush
        ? ''
        : [
            'rounded-normal border',
            compact ? 'px-sm py-xs' : 'p-sm',
            tone === 'error'
              ? 'border-border-error bg-bg-error'
              : tone === 'muted'
                ? 'border-border-1 bg-bg-3'
                : 'border-border-1 bg-bg-2',
          ],
    ]"
    :style="accent ? { '--link-preview-accent': accent } : undefined"
    :data-accent="accent ? 'own' : undefined"
  >
    <MediaEdge
      v-if="media"
      :media
      side="right"
      fade="preview"
      :engaged
      :playback="playback ?? 'autoplay'"
      :loop
      :autoplay-reduced-motion
      :class="compact ? 'w-1/2 max-w-40' : 'w-3/4 max-w-72'"
    />
    <template v-else-if="sign">
      <MediaEdge
        side="right"
        fade="preview"
        :class="compact ? 'w-1/2 max-w-40' : 'w-1/2 max-w-56'"
      >
        <span class="block size-full overflow-hidden">
          <img
            v-if="signStill"
            :src="signStill"
            class="link-preview-mark-blur size-full object-cover"
            alt=""
            loading="lazy"
            draggable="false"
          />
          <span v-else class="link-preview-wash block size-full" />
        </span>
      </MediaEdge>
      <!-- Outside the strip, which dissolves whatever stands in it. -->
      <span
        class="pointer-events-none absolute top-1/2 flex -translate-y-1/2
          items-center justify-center"
        :class="[
          compact ? 'size-10 text-3xl' : 'size-12 text-4xl',
          flush || compact ? 'right-sm' : 'right-md',
          sign.media ? 'link-preview-favicon' : 'link-preview-glyph',
        ]"
        aria-hidden="true"
        data-link-preview-mark
      >
        <Media
          v-if="sign.media"
          v-bind="sign.media"
          fit="contain"
          class="size-full"
        />
        <Icon v-else :name="sign.icon" />
      </span>
    </template>
    <!--
      The words keep clear of the window where the picture stays sharp and
      read over the rest of it; both scale with the card, so a narrow column
      does not give the picture the room the title needs. A truncated line
      clips its own halo, which draws a hard seam across the picture, so it
      gets room for the halo all round.
    -->
    <span
      class="relative z-1 flex min-w-0 flex-1 flex-col"
      :class="[
        compact ? 'gap-0.5' : 'gap-1',
        media ? (compact ? 'pr-[min(18%,3rem)]' : 'pr-[min(24%,6rem)]') : '',
        sign ? (compact ? 'pr-12' : 'pr-16') : '',
        { 'text-halo-strong-bg-2': !tone, 'm-xs': flush },
      ]"
      data-link-preview-text
    >
      <span
        v-if="parents?.length"
        class="flex min-w-0 items-center gap-1 text-xs font-semibold"
        :class="{ 'text-text-3': !tone }"
        data-link-preview-parents
        ><template v-for="(parent, index) in parents" :key="index"
          ><span v-if="index" class="shrink-0" aria-hidden="true">›</span
          ><Icon
            v-if="parent.icon"
            :name="parent.icon"
            class="link-preview-icon shrink-0"
            aria-hidden="true"
          /><span
            class="-m-[0.75em] min-w-0 truncate p-[0.75em]"
            data-link-preview-parent
            >{{ parent.label }}</span
          ></template
        ><Icon name="corner-down" class="shrink-0" aria-hidden="true"
      /></span>
      <span
        class="flex min-w-0 items-center font-semibold"
        :class="[
          compact ? 'gap-1 text-sm' : 'gap-1.5 text-base',
          { 'text-text-error': titleError },
        ]"
        ><Icon
          :name="kind.icon"
          class="link-preview-icon shrink-0"
          :class="[
            compact ? 'text-xs' : 'text-base',
            { 'text-text-2': !tone && !titleError, 'animate-pulse': loading },
          ]"
          :role="kind.label ? 'img' : undefined"
          :aria-label="kind.label"
          :aria-hidden="kind.label ? undefined : true"
          data-link-preview-kind
        /><span
          class="-m-[0.75em] min-w-0 truncate p-[0.75em]"
          data-link-preview-title
          >{{ title }}</span
        ></span
      >
      <span
        v-if="summary"
        class="-mx-[0.75em] line-clamp-2 px-[0.75em]"
        :class="[
          compact ? 'text-sm' : 'text-sm leading-snug',
          { 'text-text-2': tone !== 'error', italic: summaryItalic },
        ]"
        >{{ summary }}</span
      >
      <span v-if="$slots.note || note" class="mt-0.5 block text-sm">
        <slot name="note"><ContentLinkNote :note :plain="flush" /></slot>
      </span>
      <slot name="hint" />
      <span
        v-if="address"
        class="-m-[0.75em] min-w-0 truncate p-[0.75em] text-xs font-semibold"
        :class="{ 'text-text-3': !tone }"
        data-link-preview-address
        >{{ address }}</span
      >
    </span>
  </component>
</template>

<style scoped>
.link-preview {
  --link-preview-accent: var(--color-accent);
  --link-preview-border-share: 40%;
  --link-preview-ground-share: 8%;
}

/* A site's own colour is often pale: it takes a larger share to show. */
.link-preview[data-accent='own'] {
  --link-preview-border-share: 80%;
  --link-preview-ground-share: 16%;
}

.link-preview:is(a) {
  text-decoration: none;
}

.link-preview-interactive:focus-visible {
  border-color: color-mix(
    in oklab,
    var(--link-preview-accent) var(--link-preview-border-share),
    var(--color-border-1)
  );
  background-color: color-mix(
    in oklab,
    var(--link-preview-accent) var(--link-preview-ground-share),
    var(--color-bg-2)
  );
}

@media (hover: hover) {
  .link-preview-interactive:hover {
    border-color: color-mix(
      in oklab,
      var(--link-preview-accent) var(--link-preview-border-share),
      var(--color-border-1)
    );
    background-color: color-mix(
      in oklab,
      var(--link-preview-accent) var(--link-preview-ground-share),
      var(--color-bg-2)
    );
  }
}

/* The ground of a sign that has no picture: the card's accent, thinned. */
.link-preview-wash {
  background-color: color-mix(
    in oklab,
    var(--link-preview-accent) 45%,
    transparent
  );
}

/* A favicon's own blurred copy, grown past the strip so no edge of it shows. */
.link-preview-mark-blur {
  filter: blur(1.25rem) saturate(1.4);
  opacity: 0.7;
  transform: scale(1.6);
}

/* A glyph in the card's accent, drawn towards the text's own colour. */
.link-preview-glyph {
  color: color-mix(
    in oklab,
    var(--link-preview-accent) 70%,
    var(--color-text-1)
  );
}

/*
 * A favicon, ringed light, then dark, in colours no theme changes: whichever
 * ground it stands on, one of the two rings is unlike it, and a sign as dark
 * or as light as that ground keeps its outline. Only another site's sign
 * needs it: nobody drew it for these grounds.
 */
.link-preview-favicon {
  --mark-light: color-mix(in oklab, var(--color-white) 90%, transparent);
  --mark-dark: color-mix(in oklab, var(--color-black) 70%, transparent);
  filter: drop-shadow(0 0 1px var(--mark-light))
    drop-shadow(0 0 1px var(--mark-light)) drop-shadow(0 0 2px var(--mark-dark));
}

.link-preview-icon {
  filter: drop-shadow(0 0 0.12em var(--color-bg-2))
    drop-shadow(0 0 0.3em var(--color-bg-2))
    drop-shadow(0 0.08em 0.24em var(--color-bg-2));
}
</style>
