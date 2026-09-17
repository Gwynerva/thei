<script lang="ts" setup>
import type {
  PublicAction,
  PublicAssetDescriptor,
  PublicSecretReference,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{
  title: string;
  summary: string;
  iconMedia: MediaDescriptor;
  bannerMedia?: MediaDescriptor;
  action?: PublicAction;
  showcase: (PublicAssetDescriptor | PublicSecretReference)[];
  tags: PublicTagSummary[];
  isShowcase: boolean;
  isCv: boolean;
}>();
const accent = computed(() =>
  imageAccentCssColor(
    props.bannerMedia ? props.bannerMedia.accent : props.iconMedia.accent,
  ),
);
const iconAccent = computed(() => imageAccentCssColor(props.iconMedia.accent));
const visibleTags = computed(() => props.tags.slice(0, 3));
</script>

<template>
  <header
    class="project-hero relative isolate w-full overflow-hidden text-white"
    :class="{ 'project-hero-with-banner': bannerMedia }"
    :style="{
      '--project-hero-accent': accent,
      '--project-hero-icon-accent': iconAccent,
    }"
  >
    <PublicProjectBanner v-if="bannerMedia" :media="bannerMedia" />
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
    >
      <div
        class="relative z-2 flex min-w-0 flex-col items-center gap-md
          text-center sm:items-start sm:text-left"
        :class="bannerMedia ? 'sm:max-w-2/3' : 'sm:max-w-4/5'"
      >
        <div
          v-if="isShowcase || isCv"
          class="flex flex-wrap items-center justify-center gap-xs
            sm:justify-start"
        >
          <span
            v-if="isShowcase"
            class="inline-flex cursor-help items-center gap-2 rounded-full
              bg-white/9 px-xs py-1 text-sm font-semibold text-white/78 ring-1
              ring-white/12"
            :data-title-popup="phrase.project_showcase_badge_hint"
          >
            <Icon name="star" />
            <span>{{ phrase.project_showcase_badge }}</span>
          </span>
          <span
            v-if="isCv"
            class="inline-flex cursor-help items-center gap-2 rounded-full
              bg-white/9 px-xs py-1 text-sm font-semibold text-white/78 ring-1
              ring-white/12"
            :data-title-popup="phrase.project_cv_badge_hint"
          >
            <Icon name="case-important" />
            <span>{{ phrase.project_cv_badge }}</span>
          </span>
        </div>
        <!-- Title and summary read as one block, like PublicPageHeader. -->
        <div
          class="flex max-w-full min-w-0 flex-col items-center gap-sm
            sm:items-start"
        >
          <div
            class="flex max-w-full min-w-0 flex-col items-center gap-sm
              sm:flex-row sm:gap-md"
          >
            <Media
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
              {{ title }}
            </h1>
          </div>
          <p
            v-if="summary"
            class="hero-summary max-w-180 text-base leading-relaxed
              font-semibold text-white/72 sm:text-xl"
          >
            {{ summary }}
          </p>
        </div>
        <PublicAction v-if="action" :action />
      </div>
      <!-- md from the column gap plus md here: the gallery gets lg. -->
      <div v-if="showcase.length" class="relative z-2 mt-md min-w-0">
        <PublicAssetGallery :items="showcase" variant="hero" />
      </div>
      <PublicTagLinks
        v-if="visibleTags.length"
        :tags="visibleTags"
        class="relative z-2 justify-center sm:justify-start"
        data-hero-tags
      />
    </div>
  </header>
</template>

<style scoped>
@reference "../../styles/main.css";
.project-hero {
  background: var(--project-hero-accent);
}
.project-hero-with-banner {
  background: var(--project-hero-icon-accent);
}
.project-hero-with-banner {
  container-type: inline-size;
}
/* Darkens the blurred copy under the text; clear over the banner band. */
.hero-shade {
  background: linear-gradient(
    to bottom,
    transparent 0,
    rgb(0 0 0 / 14%) calc(56.25cqw * 0.55),
    rgb(0 0 0 / 56%) 56.25cqw,
    rgb(0 0 0 / 66%) 100%
  );
}
.hero-title {
  text-shadow:
    0 0.08em 0.34em color-mix(in oklab, var(--project-hero-accent) 56%, black),
    0 0.03em 0.1em rgb(0 0 0 / 72%);
}
.hero-summary {
  text-shadow:
    0 0.08em 0.3em color-mix(in oklab, var(--project-hero-accent) 48%, black),
    0 0.03em 0.08em rgb(0 0 0 / 64%);
}

@variant sm {
  .project-hero-with-banner {
    background: var(--color-black);
  }
  .hero-shade {
    background: rgb(0 0 0 / 70%);
    mask-image: linear-gradient(
      to right,
      black calc((100% - var(--width-wide)) / 2 + var(--width-wide) / 3),
      transparent calc((100% + var(--width-wide)) / 2 - var(--width-wide) / 6)
    );
  }
}
</style>
