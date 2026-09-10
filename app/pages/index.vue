<script lang="ts" setup>
import type { LifeLatestResponse } from '#layers/thei/shared/life';
import type { LifeRewindResponse } from '#layers/thei/shared/life-rewind';
import type { PublicProfileResponse } from '#layers/thei/shared/profile';
import PublicProfile from '#layers/thei/app/components/profile/PublicProfile.vue';
import PublicShowcaseProjects from '#layers/thei/app/components/profile/PublicShowcaseProjects.vue';

definePageMeta({ layout: 'public' });

const profileResource = await useFetch<PublicProfileResponse>('/api/profile', {
  key: 'public-profile',
});
const profile = useRequiredResource(profileResource);
const latestResource = await useFetch<LifeLatestResponse>('/api/life/latest', {
  key: 'public-latest-life',
  query: { limit: 3 },
});
const latest = useRequiredResource(latestResource);
const rewindResource = await useFetch<LifeRewindResponse>('/api/life/rewind', {
  key: 'public-rewind-preview',
  query: { preview: true },
});
const rewind = useRequiredResource(rewindResource);

useHead({ titleTemplate: null });
usePublicSeo({
  title: computed(() => {
    const nickname = profile.value.nickname.trim();
    return nickname
      ? `${profile.value.displayName} | ${nickname}`
      : profile.value.displayName;
  }),
  description: computed(() => phrase.value.public_life_description),
  canonical: '/',
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <PublicProfile :profile="profile" />
    <PublicShowcaseProjects
      v-if="profile.showcaseProjects.length"
      :projects="profile.showcaseProjects"
    />

    <section class="flex flex-col gap-sm">
      <PublicSectionHeader
        icon="heart"
        :title="phrase.latest_life"
        :action="{
          href: '/life/',
          label: phrase.view_all,
          icon: 'arrow-outward',
        }"
      />
      <div v-if="latest.points.length" class="grid gap-sm sm:grid-cols-2">
        <LifePointCard
          v-for="(point, pointIndex) in latest.points"
          :key="
            point.visibility === 'visible'
              ? point.key
              : `${point.date}:${point.entityKind}:${point.transition}:${pointIndex}`
          "
          :point="point"
          date-style="long"
          compact
          class="first:sm:col-span-2"
        />
      </div>
      <PublicEmptyState v-else icon="heart" :title="phrase.life_empty" />
    </section>
    <section v-if="rewind.items.length" class="flex flex-col gap-sm">
      <PublicSectionHeader
        icon="history"
        :title="
          phrase.life_rewind(
            formatPublicMonthDay(rewind.referenceDate, language.code),
          )
        "
        :action="{
          href: '/rewind/',
          label: phrase.view_all,
          icon: 'arrow-outward',
        }"
      />
      <div class="grid gap-sm sm:grid-cols-2">
        <LifePointCard
          v-for="(item, index) in rewind.items"
          :key="
            item.point.visibility === 'visible'
              ? item.point.key
              : `${item.point.date}:${item.point.entityKind}:${index}`
          "
          :point="item.point"
          :rewind-match="item.match"
          date-style="long"
          compact
          class="first:sm:col-span-2"
        />
      </div>
    </section>
  </main>
</template>
