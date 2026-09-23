<script setup lang="ts">
import type { PublicEntityReference } from '#layers/thei/shared/api/public';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

defineProps<{ projects: PublicEntityReference[] }>();

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
          class="showcase-project-tile size-24 overflow-clip rounded-normal
            border-2 transition group-hocus:-translate-y-0.5
            group-hocus:shadow-lg"
        >
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
        <div class="mt-xs line-clamp-2 text-center text-xs font-medium">
          {{ publicText(project.title) }}
        </div>
      </TheiLink>
    </div>
  </section>
</template>

<style scoped>
.showcase-project-tile {
  border-color: color-mix(
    in oklab,
    var(--showcase-project-accent) 32%,
    var(--color-border-1)
  );
  background: color-mix(
    in oklab,
    var(--showcase-project-accent) 12%,
    var(--color-bg-3)
  );
}
.group:where(:hover, :focus-visible) .showcase-project-tile {
  border-color: color-mix(
    in oklab,
    var(--showcase-project-accent) 56%,
    var(--color-border-2)
  );
  background: color-mix(
    in oklab,
    var(--showcase-project-accent) 20%,
    var(--color-bg-3)
  );
  box-shadow: 0 0.5rem 1.25rem
    color-mix(in oklab, var(--showcase-project-accent) 22%, transparent);
}
</style>
