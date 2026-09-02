<script lang="ts" setup>
import type { IconName } from '#thei/icons';

const publicAdmin = await usePublicAdmin();
const isAdmin = useIsAdmin();
const route = useRoute();
const settingsButton = useTemplateRef<HTMLElement>('settingsButton');
const settingsOpen = ref(false);

const items = computed<{ to: string; icon: IconName; label: string }[]>(() => [
  { to: '/life/', icon: 'heart', label: phrase.value.life },
  { to: '/projects/', icon: 'project', label: phrase.value.projects },
  { to: '/tags/', icon: 'tag', label: phrase.value.tags },
  { to: '/pages/', icon: 'page', label: phrase.value.pages },
]);

function active(to: string) {
  return route.path === to || route.path.startsWith(to);
}
</script>

<template>
  <StickyGlassHeader width="var(--width-wide)" class="z-20">
    <div class="flex h-14 items-stretch justify-between gap-xs">
      <TheiLink
        to="/"
        class="flex min-w-0 items-center gap-xs rounded-sm px-xs transition
          focus-visible:ring-2 focus-visible:ring-accent hocus:bg-accent/10"
      >
        <span
          class="size-8 shrink-0 overflow-hidden rounded-full border
            border-border-2 bg-bg-3"
        >
          <Media v-bind="publicAdmin.avatarMedia" class="size-full" />
        </span>
        <span class="truncate font-semibold tracking-tight">
          {{ publicAdmin.displayName }}
        </span>
      </TheiLink>

      <nav
        class="flex shrink-0 items-stretch"
        :aria-label="phrase.public_navigation"
      >
        <TheiLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          active-class=""
          exact-active-class=""
          :aria-current="active(item.to) ? 'page' : undefined"
          :aria-label="item.label"
          :data-title-popup="item.label"
          class="relative flex min-w-11 items-center justify-center gap-2 px-2
            text-text-2 transition focus-visible:ring-2
            focus-visible:ring-accent focus-visible:ring-inset sm:px-3
            hocus:bg-accent/10 hocus:text-text-1"
          :class="{
            [`text-text-1 after:absolute after:inset-x-2 after:bottom-0
            after:h-0.5 after:rounded-full after:bg-accent`]: active(item.to),
          }"
        >
          <Icon :name="item.icon" class="shrink-0 text-xl" />
          <span class="hidden text-sm font-semibold sm:inline">{{
            item.label
          }}</span>
        </TheiLink>
        <button
          ref="settingsButton"
          type="button"
          :aria-label="phrase.settings"
          :aria-expanded="settingsOpen"
          :data-title-popup="phrase.settings"
          class="flex min-w-11 cursor-pointer items-center justify-center px-2
            text-text-2 transition focus-visible:ring-2
            focus-visible:ring-accent focus-visible:ring-inset sm:px-3
            hocus:bg-accent/10 hocus:text-text-1"
          @click="settingsOpen = !settingsOpen"
        >
          <Icon name="palette" class="shrink-0 text-xl" />
        </button>
      </nav>
    </div>
  </StickyGlassHeader>

  <FloatingPopup
    v-model:open="settingsOpen"
    :anchor="settingsButton"
    placement="bottom-end"
    max-width="24rem"
    class="bg-bg-1/92 text-sm backdrop-blur-xl"
  >
    <SettingsVisualsBox
      :show-public-view-mode="isAdmin"
      class="scrollbar-mini max-h-full overflow-y-auto"
    />
  </FloatingPopup>
</template>
