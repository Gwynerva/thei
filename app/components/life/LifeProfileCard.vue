<script setup lang="ts">
import type { VisibleLifePoint } from '#layers/thei/shared/life';
const props = defineProps<{
  point: VisibleLifePoint;
  compact?: boolean;
  dateStyle?: 'long' | 'short';
  rewind?: boolean;
  hideDate?: boolean;
}>();

const isAvatar = computed(() => props.point.entityKind === 'profile-avatar');
</script>
<template>
  <article class="flex min-w-0 items-center gap-sm">
    <Media
      v-if="point.media"
      v-bind="point.media"
      :playback="isAvatar ? 'autoplay' : undefined"
      :autoplay-reduced-motion="isAvatar"
      :loop="isAvatar"
      :muted="isAvatar"
      class="shrink-0 overflow-hidden"
      :class="
        isAvatar
          ? [compact ? 'size-12' : 'size-16', 'rounded-full']
          : 'size-8 rounded-normal'
      "
    /><span
      v-else-if="point.entityKind === 'profile-status'"
      class="flex size-8 shrink-0 items-center justify-center rounded-normal
        text-xl"
      :class="
        point.statusKind === 'empty'
          ? 'bg-bg-3 text-text-3'
          : 'bg-accent/10 text-accent'
      "
      ><Icon name="pulse"
    /></span>
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold text-accent">
        <TheiLink
          v-if="rewind"
          :to="point.href"
          class="transition hocus:underline"
        >
          {{ isAvatar ? phrase.profile_new_avatar : phrase.profile_new_status }}
        </TheiLink>
        <template v-else>{{
          isAvatar ? phrase.profile_new_avatar : phrase.profile_new_status
        }}</template>
      </p>
      <p
        v-if="!isAvatar"
        class="mt-1 line-clamp-3 whitespace-pre-wrap"
        :class="{ italic: point.statusKind === 'empty' }"
      >
        {{
          point.statusKind === 'empty'
            ? phrase.profile_empty_status
            : point.summary
        }}
      </p>
      <ProfileDate
        v-if="!rewind && !hideDate"
        :timestamp="new Date(`${point.date}T00:00:00Z`).getTime()"
        :short="dateStyle ? dateStyle === 'short' : compact"
        class="mt-1 inline-block"
      />
      <time
        v-else-if="rewind"
        :datetime="point.date"
        class="mt-1 inline-block text-xs text-text-3"
        >{{
          formatPublicRewindDate(point.date, undefined, language.code)
        }}</time
      >
    </div>
  </article>
</template>
