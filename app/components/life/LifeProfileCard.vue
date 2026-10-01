<script setup lang="ts">
import type { PublicEntityReference } from '#layers/thei/shared/api/public';
import type { VisibleLifePoint } from '#layers/thei/shared/life';
const props = defineProps<{
  point: VisibleLifePoint;
  /**
   * The project a status belongs to, named under its words. A project's own
   * chronology leaves it out; the label above still says whose status it is.
   */
  parent?: PublicEntityReference;
  compact?: boolean;
  dateStyle?: 'long' | 'short';
  rewind?: boolean;
  hideDate?: boolean;
  /** Leaves out the generic status icon a status without media stands in. */
  hideFallbackIcon?: boolean;
}>();

const isAvatar = computed(() => props.point.entityKind === 'profile-avatar');
const label = computed(() => {
  if (isAvatar.value) return phrase.value.profile_new_avatar;
  return props.point.statusOwner === 'project'
    ? phrase.value.profile_new_project_status
    : phrase.value.profile_new_life_status;
});
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
      v-else-if="point.entityKind === 'profile-status' && !hideFallbackIcon"
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
          {{ label }}
        </TheiLink>
        <template v-else>{{ label }}</template>
      </p>
      <p
        v-if="!isAvatar"
        class="mt-1 line-clamp-3 whitespace-pre-wrap"
        :class="{ italic: point.statusKind === 'empty' }"
      >
        {{
          point.statusKind === 'empty'
            ? phrase.profile_empty_status
            : publicText(point.summary)
        }}
      </p>
      <PublicParentLink v-if="parent" :parent="parent" below class="mt-xs" />
      <ProfileDate
        v-if="!rewind && !hideDate"
        :date="point.date"
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
