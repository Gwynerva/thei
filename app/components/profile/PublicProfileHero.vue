<script setup lang="ts">
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import type {
  ProfileAvatarHistoryItem,
  PublicProfileResponse,
} from '#layers/thei/shared/profile';
const props = defineProps<{ profile: PublicProfileResponse }>();
const open = ref(false);
const history = useProfileHistory<ProfileAvatarHistoryItem>(
  '/api/profile/avatars',
);
const avatarShadow = computed(() =>
  imageAccentCssColor(
    props.profile.avatarMedia.accent,
    'var(--color-shadow-2)',
    0.45,
  ),
);
async function toggle() {
  open.value = !open.value;
  if (open.value) await history.load();
}
useHashDisclosure('#avatars', open, history.load);
</script>
<template>
  <section
    class="overflow-hidden rounded-normal border border-border-1 bg-bg-2
      shadow-lg shadow-shadow-1"
  >
    <div
      class="relative aspect-3/1 max-h-80 w-full overflow-hidden bg-bg-accent"
    >
      <Media
        v-if="profile.bannerMedia"
        v-bind="profile.bannerMedia"
        fit="cover"
        playback="autoplay"
        autoplay-reduced-motion
        loop
        muted
        class="size-full min-w-full"
      /><GridPattern v-else class="absolute inset-0 opacity-35" />
    </div>
    <div
      class="relative flex flex-col items-center gap-md px-md pb-md sm:flex-row
        sm:items-start sm:px-md"
    >
      <button
        type="button"
        :disabled="profile.avatarCount < 2"
        class="group relative -mt-10 size-28 shrink-0 overflow-hidden
          rounded-full border-4 border-bg-2 bg-bg-3 shadow-lg shadow-shadow-2
          enabled:cursor-pointer sm:-mt-12 sm:size-36"
        :style="{ '--tw-shadow-color': avatarShadow }"
        :aria-label="phrase.profile_avatar_count(profile.avatarCount)"
        :aria-expanded="open"
        aria-controls="avatars"
        @click="toggle"
      >
        <Media
          v-bind="profile.avatarMedia"
          playback="autoplay"
          autoplay-reduced-motion
          loop
          muted
          class="size-full"
        /><span
          v-if="profile.avatarCount > 1"
          class="absolute inset-x-0 bottom-0 bg-black/60 pt-2 pb-3 text-center
            text-xs font-semibold text-white opacity-0 transition-opacity
            group-hocus:opacity-100"
          >{{ phrase.profile_avatar_count(profile.avatarCount) }}</span
        >
      </button>
      <div class="min-w-0 flex-1 text-center sm:pt-md sm:text-left">
        <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
          {{ publicText(profile.displayName) }}
        </h1>
        <p v-if="profile.slogan" class="mt-xs font-bold text-text-2">
          {{ publicText(profile.slogan) }}
        </p>
      </div>
      <div
        class="flex shrink-0 flex-wrap justify-center gap-sm sm:grid
          sm:grid-cols-[max-content_max-content] sm:justify-end sm:gap-x-sm
          sm:gap-y-sm sm:pt-md"
      >
        <ProfileSiteStats
          kind="project"
          :count="profile.projects.count"
          :items="profile.projects.items"
        /><ProfileSiteStats
          kind="event"
          :count="profile.events.count"
          :items="profile.events.items"
        />
      </div>
    </div>
    <div
      v-if="open"
      id="avatars"
      class="scroll-mt-[var(--public-anchor-offset,8rem)] border-t
        border-border-1 bg-bg-1/40 p-md"
    >
      <ProfileAvatarHistory
        :items="history.items.value"
        autoplay
        short-date
        :more="!history.loaded.value || Boolean(history.cursor.value)"
        :loading="history.loading.value"
        :error="history.error.value"
        @load="history.load"
      />
    </div>
  </section>
</template>
