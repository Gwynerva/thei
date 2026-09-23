<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * Shows the site icon where people actually meet it.
 *
 * A 24 px square in a settings form says nothing about whether an icon works:
 * what matters is whether it reads in a browser tab, in both themes, and at
 * the small sizes it is actually drawn at — from the file currently selected,
 * before it is saved.
 */
const { media, siteName } = defineProps<{
  media?: MediaDescriptor;
  siteName: string;
}>();

const src = computed(() => sitePath(media?.previewSrc ?? media?.src));
const sizes = [16, 32, 48];
const card = 'h-24 rounded-normal py-sm';

/**
 * The colours of the mockups are written out rather than taken from the
 * theme: they stand for someone else's window, light or dark, which does not
 * change when this site's palette does — so the icon is checked against both
 * whichever theme the admin itself is in.
 */
const windowTheme = {
  light: 'border-[#dadce0] bg-white text-[#3c4043]',
  dark: 'border-[#3c4043] bg-[#292a2d] text-[#e8eaed]',
} as const;
</script>

<template>
  <!-- The cards are laid out by the parent row, next to the picker tile, and
       only illustrate it: everything they show is already in the tile. -->
  <div class="contents" aria-hidden="true">
    <div
      v-for="theme in ['dark', 'light'] as const"
      :key="theme"
      class="flex shrink-0 items-end justify-center gap-xs border px-xs
        sm:gap-sm sm:px-sm"
      :class="[card, windowTheme[theme]]"
    >
      <div
        v-for="size in sizes"
        :key="size"
        class="flex flex-col items-center gap-1"
      >
        <span
          class="overflow-hidden rounded-xs bg-current/10"
          :style="{ width: `${size}px`, height: `${size}px` }"
        >
          <img
            v-if="src"
            :src="src"
            alt=""
            class="size-full object-contain"
            draggable="false"
          />
        </span>
        <span class="text-[0.625rem] opacity-60">{{ size }}px</span>
      </div>
    </div>

    <div
      class="flex min-w-0 grow basis-52 flex-col justify-center gap-xs bg-bg-3
        px-sm"
      :class="card"
    >
      <!-- A browser tab, drawn plainly: rounded top, icon, title, close. -->
      <div
        v-for="theme in ['light', 'dark'] as const"
        :key="theme"
        class="flex items-center gap-xs rounded-t-normal border px-xs py-1.5
          text-xs"
        :class="windowTheme[theme]"
      >
        <img
          v-if="src"
          :src="src"
          alt=""
          class="size-4 shrink-0 object-contain"
          draggable="false"
        />
        <span v-else class="size-4 shrink-0 rounded-xs bg-current/20" />
        <span class="min-w-0 flex-1 truncate">{{ siteName }}</span>
        <span class="opacity-50">✕</span>
      </div>
    </div>
  </div>
</template>
