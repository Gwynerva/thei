<script lang="ts" setup>
import type { LifeLatestResponse } from '#layers/thei/shared/life';
import type { LifeRewindResponse } from '#layers/thei/shared/life-rewind';
import type { PublicProfileResponse } from '#layers/thei/shared/profile';
import PublicProfile from '#layers/thei/app/components/profile/PublicProfile.vue';
import PublicShowcaseProjects from '#layers/thei/app/components/profile/PublicShowcaseProjects.vue';

definePageMeta({ layout: 'public' });
// The profile banner already paints the page top.
usePublicPageGlow({ enabled: false });

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

const publicLinks = computed(() =>
  profile.value.externalLinks
    .filter((link) => !link.isPrivate)
    .map((link) => link.url),
);

useHead({ titleTemplate: null });
// The card a link to the home page previews as.
const ogImage = useOgImage(
  'site',
  () => 'site',
  () => [
    profile.value.displayName,
    profile.value.slogan,
    profile.value.avatarMedia.src,
  ],
);
usePublicSeo({
  ogImage,
  ogType: 'profile',
  title: computed(() => {
    const nickname = profile.value.nickname.trim();
    return nickname
      ? `${profile.value.displayName} - ${nickname}`
      : profile.value.displayName;
  }),
  description: computed(
    () => profile.value.seoDescription || phrase.value.public_life_description,
  ),
  canonical: '/',
  pageType: 'ProfilePage',
  image: () => profile.value.avatarMedia.src,
  entities: () => [
    {
      '@type': 'Person',
      '@id': '#person',
      name: profile.value.displayName,
      ...(profile.value.nickname.trim()
        ? { alternateName: profile.value.nickname.trim() }
        : {}),
      ...(profile.value.slogan.trim()
        ? { description: profile.value.slogan.trim() }
        : {}),
      image: profile.value.avatarMedia.src,
      url: '/',
      // `getProfileLinks` hands an admin their private links too, and those
      // describe the person to nobody but the admin.
      ...(publicLinks.value.length ? { sameAs: publicLinks.value } : {}),
    },
  ],
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
        :title="phrase.activity_summary"
        :action="{
          href: '/life/',
          label: phrase.view_all,
          icon: 'arrow-outward',
        }"
      />
      <!-- The heatmap is a card among the cards: the same step between it
           and the first of them as between any two. -->
      <div class="flex flex-col gap-md">
        <LifeActivityHeatmap />
        <div
          v-if="latest.points.length"
          data-home-card-grid="latest"
          class="grid gap-md sm:grid-cols-2"
        >
          <LifePointCard
            v-for="point in latest.points"
            :key="point.key"
            :point="point"
            data-home-card
            date-style="long"
            compact
            :class="{
              'first:sm:col-span-2': publicCardGridFirstItemIsWide(
                latest.points.length,
              ),
            }"
          />
        </div>
        <PublicEmptyState
          v-else
          :title="phrase.life_empty"
          :description="phrase.life_empty_description"
        />
      </div>
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
      <div data-home-card-grid="rewind" class="grid gap-md sm:grid-cols-2">
        <LifePointCard
          v-for="item in rewind.items"
          :key="item.point.key"
          :point="item.point"
          data-home-card
          :rewind-match="item.match"
          date-style="long"
          compact
          :class="{
            'first:sm:col-span-2': publicCardGridFirstItemIsWide(
              rewind.items.length,
            ),
          }"
        />
      </div>
    </section>
  </main>
</template>
