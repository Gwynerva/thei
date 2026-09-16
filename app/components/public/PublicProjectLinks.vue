<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicProjectLink,
} from '#layers/thei/shared/api/public';

defineProps<{ projects: PublicProjectLink[] }>();
</script>

<template>
  <div v-if="projects.length" class="flex min-w-0 flex-wrap items-center gap-2">
    <template
      v-for="project in projects"
      :key="isPublicSecret(project) ? project.key : project.href"
    >
      <span
        v-if="isPublicSecret(project)"
        :data-title-popup="phrase.secret_hint"
        class="pointer-events-auto relative z-3 inline-flex max-w-full min-w-0
          items-center gap-2 rounded-sm bg-bg-3/80 py-1 pr-xs pl-1 text-sm
          font-normal text-text-3"
      >
        <PublicSecretIcon
          :secret="project"
          decorative
          class="size-5 shrink-0 rounded-sm bg-bg-4 sm:size-7"
        />
        <span class="min-w-0 leading-snug break-words italic">{{
          project.title
        }}</span>
      </span>
      <TheiLink
        v-else
        :to="project.href"
        :aria-label="project.title"
        :data-title-popup="project.summary"
        class="pointer-events-auto relative z-3 inline-flex max-w-full min-w-0
          items-center gap-2 rounded-sm bg-bg-3/80 py-1 pr-xs pl-1 text-sm
          font-normal text-text-2 transition focus-visible:ring-2
          focus-visible:ring-accent focus-visible:outline-none
          hocus:bg-accent/15 hocus:text-accent"
      >
        <span
          class="size-5 shrink-0 overflow-hidden rounded-sm bg-bg-4 sm:size-7"
        >
          <Media
            v-bind="project.iconMedia"
            playback="autoplay"
            autoplay-reduced-motion
            loop
            muted
            class="size-full"
          />
        </span>
        <span class="min-w-0 leading-snug break-words">{{
          project.title
        }}</span>
      </TheiLink>
    </template>
  </div>
</template>
