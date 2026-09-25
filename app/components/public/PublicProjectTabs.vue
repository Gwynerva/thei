<script lang="ts" setup>
import {
  buildProjectTimelineUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';

/**
 * The two faces of a project page, as the last strip of its hero.
 *
 * Plain links rather than client state: each tab is an address of its own,
 * with its own title, canonical and place in the sitemap, and a reader can
 * send either one to someone else.
 */
const { humanReadableSlug, publicId, active, timelineCount } = defineProps<{
  humanReadableSlug: string;
  publicId: string;
  active: 'overview' | 'timeline';
  /** How many points the project's chronology holds. */
  timelineCount: number;
}>();

const tabs = computed(() => [
  {
    key: 'overview' as const,
    icon: 'blocks' as const,
    label: phrase.value.project_tab_overview,
    href: buildProjectUrl(humanReadableSlug, publicId),
  },
  {
    key: 'timeline' as const,
    icon: 'heart' as const,
    label: phrase.value.project_tab_timeline,
    href: buildProjectTimelineUrl(humanReadableSlug, publicId),
    count: timelineCount,
  },
]);
</script>

<template>
  <!--
    The hero is dark in either theme, but the strip follows the theme: in the
    light one it is light glass, so the theme's own accent reads on it.
  -->
  <nav
    class="relative z-2 border-t border-border-1 bg-bg-1/85 backdrop-blur-md
      dark:border-white/10 dark:bg-black/30"
    :aria-label="phrase.project_tabs"
  >
    <div
      class="m-auto flex w-(--width-wide) justify-center gap-xs px-window
        sm:justify-start"
    >
      <TheiLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.href"
        :aria-current="tab.key === active ? 'page' : undefined"
        class="relative flex items-center gap-xs px-xs py-sm text-sm
          font-semibold transition focus-visible:ring-2
          focus-visible:ring-accent focus-visible:ring-inset sm:px-sm"
        :class="
          tab.key === active
            ? 'text-accent'
            : `text-text-2 dark:text-white/60 hocus:bg-bg-3/60 hocus:text-accent
              dark:hocus:bg-white/6`
        "
      >
        <Icon :name="tab.icon" class="shrink-0" aria-hidden="true" />
        <span class="tab-label">{{ tab.label }}</span>
        <span
          v-if="tab.count"
          class="rounded-full bg-bg-3 px-2 py-0.5 text-xs leading-none
            tabular-nums dark:bg-white/12"
        >
          {{ tab.count }}
        </span>
        <!-- Straddles the hero's lower edge, so it reads as the tab's own mark
             rather than as the line between the hero and the page. -->
        <span
          v-if="tab.key === active"
          class="absolute inset-x-xs -bottom-0.5 h-1 rounded-full bg-accent
            shadow-md shadow-accent/50 sm:inset-x-sm"
          aria-hidden="true"
        />
      </TheiLink>
      <!--
        Controls for the open tab, such as the chronology's filter. On a phone
        they join the centred tabs rather than float over them; from sm up
        they keep to the right edge.
      -->
      <div v-if="$slots.end" class="flex items-center sm:ml-auto">
        <slot name="end" />
      </div>
    </div>
  </nav>
</template>

<style scoped>
/* A halo in the strip's own colour lifts the letters off the banner behind. */
.tab-label {
  text-shadow:
    0 0.03em 0.08em var(--color-bg-1),
    0 0 0.6em var(--color-bg-1);
}
</style>
