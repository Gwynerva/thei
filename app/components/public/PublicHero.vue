<script lang="ts" setup>
import type {
  PublicAction,
  PublicAssetDescriptor,
  PublicSecretReference,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { IconName } from '#thei/icons';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * The dark head of a page that has a picture to open with.
 *
 * A project always opens with it, banner or not, its icon beside the title
 * and its showcase, tags and tabs under the words. An event or a section
 * opens with it only once it has a banner, and says what it is above the
 * title instead: an event in a pill, a section in the one line naming its
 * project that its plain header has too (`PublicPageParent`). Without a
 * banner they keep `PublicPageHeader`, whose words these are.
 */
const props = defineProps<{
  title: string;
  summary?: string;
  bannerMedia?: MediaDescriptor;
  /** A project's own icon, beside its title. */
  iconMedia?: MediaDescriptor;
  /** What the page is, when it has no icon of its own. */
  kind?: { icon: IconName; label: string };
  /** What the page is a part of, and what it is of it: a section's project. */
  parent?: {
    label: string;
    href: string;
    title: string;
    iconMedia?: MediaDescriptor;
  };
  action?: PublicAction;
  showcase?: (PublicAssetDescriptor | PublicSecretReference)[];
  tags?: PublicTagSummary[];
  isShowcase?: boolean;
  isCv?: boolean;
}>();
const slots = useSlots();
const accent = computed(() =>
  imageAccentCssColor((props.bannerMedia ?? props.iconMedia)?.accent),
);
const iconAccent = computed(() =>
  imageAccentCssColor((props.iconMedia ?? props.bannerMedia)?.accent),
);
const visibleTags = computed(() => props.tags?.slice(0, 3) ?? []);
/**
 * Only the words and the banner: nothing under them gives the hero height,
 * so it keeps some of its own for the banner to be seen at, with the words
 * in the middle of it.
 */
const tall = computed(
  () =>
    Boolean(props.bannerMedia) &&
    !props.showcase?.length &&
    !visibleTags.value.length &&
    !slots.tabs,
);
// The hero paints the page top.
usePublicPageGlow({ enabled: false });
/** The pills over the banner: what the page is, and its marks. */
const heroPill = `inline-flex items-center gap-2 rounded-full bg-white/9 text-sm
  font-semibold ring-1 ring-white/12`;
</script>

<template>
  <header
    class="hero relative isolate w-full overflow-x-clip text-white"
    :class="{ 'hero-with-banner': bannerMedia }"
    :style="{
      '--hero-accent': accent,
      '--hero-icon-accent': iconAccent,
    }"
  >
    <PublicHeroBanner v-if="bannerMedia" :media="bannerMedia" />
    <div
      class="pointer-events-none absolute inset-0"
      :class="bannerMedia ? 'hero-shade' : 'bg-black/70'"
      data-hero-shade
      aria-hidden="true"
    />
    <!-- Reserves the sharp banner band on mobile; the banner itself is absolute. -->
    <div
      v-if="bannerMedia"
      class="aspect-video w-full sm:hidden"
      aria-hidden="true"
    />
    <div
      class="relative m-auto flex w-(--width-wide) flex-col gap-md px-window
        py-lg sm:py-xl"
      :class="{ 'sm:min-h-80 sm:justify-center': tall }"
    >
      <div
        class="relative z-2 flex min-w-0 flex-col items-center gap-md
          text-center sm:items-start sm:text-left"
        :class="bannerMedia ? 'sm:max-w-2/3' : 'sm:max-w-4/5'"
      >
        <div
          v-if="isShowcase || isCv || kind"
          class="flex max-w-full flex-wrap items-center justify-center gap-xs
            sm:justify-start"
          data-hero-pills
        >
          <span
            v-if="kind"
            :class="heroPill"
            class="px-xs py-1 text-white/78"
            data-hero-kind
          >
            <Icon :name="kind.icon" />
            <span>{{ kind.label }}</span>
          </span>
          <span
            v-if="isShowcase"
            :class="heroPill"
            class="cursor-help px-xs py-1 text-white/78"
            :data-title-popup="phrase.project_showcase_badge_hint"
          >
            <Icon name="star" />
            <span>{{ phrase.project_showcase_badge }}</span>
          </span>
          <span
            v-if="isCv"
            :class="heroPill"
            class="cursor-help px-xs py-1 text-white/78"
            :data-title-popup="phrase.project_cv_badge_hint"
          >
            <Icon name="case-important" />
            <span>{{ phrase.cv_project_label }}</span>
          </span>
        </div>
        <!-- Title and summary read as one block, like PublicPageHeader, and
             a section's project heads it at the same small distance. -->
        <div
          class="flex max-w-full min-w-0 flex-col items-center gap-sm
            sm:items-start"
        >
          <div
            class="flex max-w-full min-w-0 flex-col items-center gap-xs
              sm:items-start"
          >
            <PublicPageParent
              v-if="parent"
              :parent
              on-dark
              class="hero-parent"
              data-hero-parent
            />
            <div
              class="flex max-w-full min-w-0 flex-col items-center gap-sm
                sm:flex-row sm:gap-md"
            >
              <Media
                v-if="iconMedia"
                v-bind="iconMedia"
                fit="contain"
                playback="autoplay"
                autoplay-reduced-motion
                loop
                muted
                class="size-24 shrink-0 rounded-normal"
                data-hero-icon
              />
              <h1
                class="hero-title max-w-full min-w-0 text-3xl leading-tight
                  font-bold tracking-tight text-balance wrap-break-word
                  sm:text-5xl"
              >
                {{ publicText(title) }}
              </h1>
            </div>
          </div>
          <p
            v-if="summary"
            class="hero-summary max-w-180 text-base leading-relaxed
              font-semibold text-white/72 sm:text-xl"
          >
            {{ publicText(summary) }}
          </p>
        </div>
        <PublicAction v-if="action" :action />
      </div>
      <!-- md from the column gap plus md here: the gallery gets lg. -->
      <div v-if="showcase?.length" class="relative z-2 mt-md min-w-0">
        <PublicAssetGallery :items="showcase" variant="hero" />
      </div>
      <PublicTagLinks
        v-if="visibleTags.length"
        :tags="visibleTags"
        size="lg"
        class="hero-tags relative z-2 justify-center sm:justify-start"
        data-hero-tags
      />
    </div>
    <!-- The tabs close the hero: part of it, but pinned to its lower edge. -->
    <slot name="tabs" />
  </header>
</template>

<style scoped>
@reference "../../styles/main.css";
.hero {
  background: var(--hero-accent);
}
.hero-with-banner {
  background: var(--hero-icon-accent);
  container-type: inline-size;
}
/* Phones: darkens the blurred copy under the text; clear over the band. */
.hero-shade {
  background: linear-gradient(
    to bottom,
    transparent 0,
    rgb(0 0 0 / 14%) calc(56.25cqw * 0.55),
    rgb(0 0 0 / 56%) 56.25cqw,
    rgb(0 0 0 / 66%) 100%
  );
}
/*
 * The last, widest shadow is for a long title or summary that runs past the
 * shade onto a light banner: it darkens the banner around the letters.
 */
.hero-title {
  text-shadow:
    0 0.08em 0.34em color-mix(in oklab, var(--hero-accent) 56%, black),
    0 0.03em 0.1em rgb(0 0 0 / 72%),
    0 0 0.8em rgb(0 0 0 / 56%);
}
.hero-summary {
  text-shadow:
    0 0.08em 0.3em color-mix(in oklab, var(--hero-accent) 48%, black),
    0 0.03em 0.08em rgb(0 0 0 / 64%),
    0 0 0.9em rgb(0 0 0 / 64%);
}
/*
 * Tags wear their own colours, which the light theme makes too dark for the
 * hero; the hero is dark in either theme, so they take the dark theme's.
 */
.hero-tags {
  --lightness-accent: var(--lightness-accent-dark);
  --chroma-accent: var(--chroma-accent-dark);
}
/* Small words over the banner, with the shade they need on a light one. */
.hero-tags,
.hero-parent {
  text-shadow:
    0 0.03em 0.08em rgb(0 0 0 / 72%),
    0 0 0.6em rgb(0 0 0 / 80%);
}

@variant sm {
  /*
   * The column the words sit in, measured on the hero: the banner lays
   * itself out from it too (`PublicHeroBanner`). Every box these are used
   * in is as wide as the hero, which the column's percentage resolves to.
   */
  .hero-with-banner {
    --hero-column: var(--width-wide);
    --hero-column-start: calc((100cqw - var(--hero-column)) / 2);
    --hero-column-end: calc(var(--hero-column-start) + var(--hero-column));
    /* The words take two thirds of it. */
    --hero-words-end: calc(
      var(--hero-column-start) + var(--hero-column) * 2 / 3
    );
    background: var(--color-black);
  }
  /*
   * Darkens the banner's blurred copy where the words start and lets go
   * across the whole column, so slowly that nowhere can be pointed at as
   * where it ends: the words read on the banner's own colours, and the
   * margin past the column, where there is nothing to read, keeps them as
   * they are.
   */
  .hero-shade {
    background: rgb(0 0 0 / 60%);
    @apply mask-ease;
    --ease-direction: to right;
    --ease-from: var(--hero-column-start);
    --ease-to: var(--hero-column-end);
  }
}
</style>
