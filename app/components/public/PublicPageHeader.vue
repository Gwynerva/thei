<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

const props = defineProps<{
  icon: IconName;
  title: string;
  description?: string;
  /**
   * `custom` marks an icon the author chose (a tag or page icon): it is shown
   * as a rounded tile, with an accent fallback while none is set. Defaults to
   * `custom` whenever `iconMedia` is passed.
   */
  iconKind?: 'technical' | 'custom';
  iconMedia?: MediaDescriptor;
  /** Accent for the fallback icon and the page glow, e.g. a tag color. */
  accentColor?: string;
  backLink?: {
    href: string;
    title: string;
    iconMedia?: MediaDescriptor;
  };
}>();

const isCustom = computed(
  () =>
    (props.iconKind ?? (props.iconMedia ? 'custom' : 'technical')) === 'custom',
);
const accent = computed(
  () =>
    props.accentColor ??
    (props.iconMedia?.accent
      ? imageAccentCssColor(props.iconMedia.accent)
      : props.backLink?.iconMedia?.accent
        ? imageAccentCssColor(props.backLink.iconMedia.accent)
        : undefined),
);

usePublicPageGlow({ color: accent });
</script>

<template>
  <!--
    Header rhythm shared with PublicProjectHero: the title, back link and
    description sit together (sm), and whatever follows them — a call to
    action — keeps a clear md gap.
  -->
  <header
    class="flex max-w-192 flex-col items-center gap-md text-center
      sm:items-start sm:text-left"
    :style="accent ? { '--page-header-accent': accent } : undefined"
  >
    <div class="flex max-w-full flex-col items-center gap-sm sm:items-start">
      <div
        class="flex max-w-full min-w-0 flex-col items-center gap-sm sm:flex-row"
      >
        <span
          v-if="isCustom"
          class="flex size-20 shrink-0 items-center justify-center
            overflow-hidden rounded-normal bg-bg-accent text-4xl
            text-[var(--page-header-accent,var(--color-accent))] sm:size-14
            sm:text-3xl"
        >
          <Media v-if="iconMedia" v-bind="iconMedia" class="size-full" />
          <Icon v-else :name="icon" />
        </span>
        <template v-else>
          <span
            class="mb-xs flex size-18 items-center justify-center rounded-full
              border border-accent/25 bg-bg-accent text-4xl text-accent
              shadow-lg ring-8 shadow-accent/15 ring-bg-accent/40 sm:hidden"
            aria-hidden="true"
          >
            <Icon :name="icon" />
          </span>
          <Icon
            :name="icon"
            class="hidden shrink-0 text-3xl text-text-3 sm:block"
          />
        </template>
        <h1
          class="max-w-full text-3xl font-bold tracking-tight text-balance
            wrap-break-word sm:text-4xl"
        >
          {{ title }}
        </h1>
      </div>
      <TheiLink
        v-if="backLink"
        :to="backLink.href"
        class="group relative isolate inline-flex max-w-full items-center gap-xs
          overflow-hidden rounded-full border border-border-1 bg-bg-2/70 py-2
          pl-2.5 text-sm font-semibold text-text-2 shadow-sm shadow-shadow-1
          backdrop-blur-sm transition focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none
          hocus:border-border-2 hocus:text-text-1"
        :class="backLink.iconMedia ? 'pr-18' : 'pr-sm'"
      >
        <MediaEdge
          v-if="backLink.iconMedia"
          :media="backLink.iconMedia"
          side="right"
          fade="preview"
          playback="autoplay"
          autoplay-reduced-motion
          loop
          muted
          class="-z-1 w-20"
        />
        <Icon name="chevron-left" class="shrink-0 text-lg text-text-3" />
        <span class="truncate">{{ backLink.title }}</span>
      </TheiLink>
      <p
        v-if="description"
        class="text-lg leading-relaxed font-semibold text-balance text-text-2
          sm:text-xl sm:text-pretty"
      >
        {{ description }}
      </p>
    </div>
    <slot></slot>
  </header>
</template>
