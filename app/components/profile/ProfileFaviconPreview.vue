<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * Shows the site icon where people actually meet it.
 *
 * A 24 px square in a settings form says nothing about whether an icon works:
 * what matters is whether it reads in a browser tab, on a phone home screen
 * and beside a search result. Those are the three shown here, in both themes,
 * from the file currently selected — before it is saved.
 */
const { media, siteName } = defineProps<{
  media?: MediaDescriptor;
  siteName: string;
  siteHost: string;
}>();

const src = computed(() => sitePath(media?.previewSrc ?? media?.src));
const sizes = [16, 32, 48];

/**
 * The colours of the two browser mockups are written out rather than taken
 * from the theme: they stand for someone else's window, which does not change
 * when this site's palette does.
 */
const tabTheme = {
  light: 'border-[#dadce0] bg-white text-[#3c4043]',
  dark: 'border-[#3c4043] bg-[#292a2d] text-[#e8eaed]',
} as const;

/**
 * The home screen shows the touch icon, which iOS never draws transparent:
 * the same darkened tint the server bakes behind it, approximated here from
 * the icon's own accent so the preview does not wait for a save.
 */
const homeScreenPlate = computed(() =>
  media?.accent
    ? `oklch(0.32 ${Math.min(media.accent.chroma, 0.12)} ${media.accent.hue})`
    : undefined,
);
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col gap-sm">
    <div class="flex flex-wrap items-end gap-md">
      <div
        v-for="size in sizes"
        :key="size"
        class="flex flex-col items-center gap-1"
      >
        <span
          class="overflow-hidden rounded-xs bg-bg-3"
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
        <span class="text-[0.625rem] text-text-3">{{ size }}px</span>
      </div>
    </div>

    <div class="flex flex-wrap gap-md">
      <div
        v-for="theme in ['light', 'dark'] as const"
        :key="theme"
        class="flex min-w-0 flex-1 basis-56 flex-col gap-1"
      >
        <!-- A browser tab, drawn plainly: rounded top, icon, title, close. -->
        <div
          class="flex items-center gap-xs rounded-t-normal border px-xs py-1
            text-xs"
          :class="tabTheme[theme]"
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
        <span class="text-[0.625rem] text-text-3">
          {{
            theme === 'light'
              ? phrase.favicon_preview_tab_light
              : phrase.favicon_preview_tab_dark
          }}
        </span>
      </div>

      <div class="flex shrink-0 flex-col items-center gap-1">
        <span
          class="flex size-14 items-center justify-center overflow-hidden
            rounded-[22%] bg-bg-3 p-1.5 shadow-md shadow-shadow-1"
          :style="{ background: homeScreenPlate }"
        >
          <img
            v-if="src"
            :src="src"
            alt=""
            class="size-full object-contain"
            draggable="false"
          />
        </span>
        <span class="text-[0.625rem] text-text-3">
          {{ phrase.favicon_preview_home_screen }}
        </span>
      </div>
    </div>

    <!-- A search result: the icon sits beside the address, small and round. -->
    <div class="flex items-center gap-xs rounded-normal bg-bg-3 p-sm">
      <span
        class="flex size-7 shrink-0 items-center justify-center overflow-hidden
          rounded-full bg-bg-2"
      >
        <img
          v-if="src"
          :src="src"
          alt=""
          class="size-5 object-contain"
          draggable="false"
        />
      </span>
      <span class="min-w-0">
        <span class="block truncate text-xs text-text-2">{{ siteHost }}</span>
        <span class="block truncate text-sm text-accent">{{ siteName }}</span>
      </span>
    </div>
  </div>
</template>
