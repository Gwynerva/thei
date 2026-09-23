<script setup lang="ts">
import type { PublicEntityReference } from '#layers/thei/shared/api/public';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

defineProps<{ projects: PublicEntityReference[] }>();

/** A still picture of the icon: a video's preview frame, or the image itself. */
function shadowSrc(project: PublicEntityReference) {
  const media = project.iconMedia;
  if (!media) return undefined;
  return media.kind === 'video'
    ? media.previewSrc
    : (media.previewSrc ?? media.src);
}

function accentStyle(project: PublicEntityReference) {
  return {
    '--showcase-project-accent': imageAccentCssColor(
      project.iconMedia?.accent,
      'var(--color-accent)',
    ),
  };
}
</script>

<template>
  <section class="flex flex-col gap-sm">
    <PublicSectionHeader
      icon="project"
      :title="phrase.profile_best_projects"
      :action="{
        href: '/search/?type=project&showcase=1',
        label: phrase.view_all,
        icon: 'arrow-outward',
      }"
    />
    <div class="flex flex-wrap gap-md">
      <TheiLink
        v-for="project in projects"
        :key="project.href"
        :to="project.href"
        :aria-label="project.title"
        :data-title-popup="project.summary"
        class="group flex w-24 min-w-0 flex-col items-center text-center
          text-text-2 transition-colors sm:w-30 hocus:text-text-1"
      >
        <div
          :style="accentStyle(project)"
          class="relative size-24 transition group-hocus:-translate-y-0.5"
        >
          <!--
            The shadow is cast by a still copy of the icon lying under it, so
            it follows the icon's outline. It is drawn once and only faded in
            and out: animating the filter itself redraws it every frame, which
            is what made it lag behind the hover.
          -->
          <div
            v-if="shadowSrc(project)"
            class="showcase-project-shadow pointer-events-none absolute inset-0
              opacity-0 transition-opacity duration-300 group-hocus:opacity-100
              motion-reduce:duration-150"
            aria-hidden="true"
          >
            <div class="size-full overflow-clip rounded-normal">
              <img
                :src="sitePath(shadowSrc(project)!)"
                class="size-full object-contain"
                alt=""
                loading="lazy"
                draggable="false"
              />
            </div>
          </div>
          <div class="relative size-full overflow-clip rounded-normal">
            <Media
              v-if="project.iconMedia"
              v-bind="project.iconMedia"
              fit="contain"
              playback="autoplay"
              autoplay-reduced-motion
              loop
              muted
              class="size-full"
            />
          </div>
        </div>
        <div class="mt-xs line-clamp-2 text-center text-xs font-medium">
          {{ publicText(project.title) }}
        </div>
      </TheiLink>
    </div>
  </section>
</template>

<style scoped>
.showcase-project-shadow {
  filter: drop-shadow(
    0 0.45rem 0.7rem
      color-mix(in oklab, var(--showcase-project-accent) 45%, transparent)
  );
  will-change: opacity;
}
</style>
