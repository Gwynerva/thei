<script lang="ts" setup>
import type { LifeLatestResponse } from '#layers/thei/shared/life';
import type { PublicPageListItem } from '#layers/thei/shared/api/page';

definePageMeta({ layout: 'public' });

const publicAdmin = await usePublicAdmin();
const [latestResource, pagesResource] = await Promise.all([
  useFetch<LifeLatestResponse>('/api/life/latest', {
    query: { limit: 5 },
  }),
  useFetch<PublicPageListItem[]>('/api/pages', {
    query: { limit: 5 },
  }),
]);
const latest = useRequiredResource(latestResource);
const pages = useRequiredResource(pagesResource);

usePublicSeo({
  title: publicAdmin.value.displayName,
  description: computed(() => phrase.value.public_life_description),
  canonical: '/',
});
</script>

<template>
  <main class="m-auto flex w-(--width-wide) flex-col gap-lg px-window py-lg">
    <section
      class="relative isolate overflow-hidden rounded-normal border
        border-border-1 bg-bg-2 p-md shadow-lg shadow-shadow-1 sm:p-lg"
    >
      <GridPattern
        class="pointer-events-none absolute inset-0 -z-1 opacity-35"
      />
      <div class="flex flex-col items-start gap-md sm:flex-row sm:items-center">
        <div
          class="size-28 shrink-0 overflow-hidden rounded-full border-2
            border-border-2 bg-bg-3 shadow-lg shadow-shadow-2 sm:size-36"
        >
          <Media v-bind="publicAdmin.avatarMedia" class="size-full" />
        </div>
        <div class="min-w-0">
          <p
            class="mb-1 flex items-center gap-2 text-sm font-semibold
              text-accent"
          >
            <Icon name="thei" />
            {{ phrase.latest_life }}
          </p>
          <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">
            {{ publicAdmin.displayName }}
          </h1>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-sm">
      <PublicSectionHeader
        icon="heart"
        :title="phrase.latest_life"
        :action="{
          href: '/life/',
          label: phrase.view_all_life,
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
          compact
          class="first:sm:col-span-2"
        />
      </div>
      <PublicEmptyState v-else icon="heart" :title="phrase.life_empty" />
    </section>

    <section v-if="pages.length" class="flex flex-col gap-sm">
      <PublicSectionHeader
        icon="page"
        :title="phrase.latest_pages"
        :action="{
          href: '/pages/',
          label: phrase.view_all_pages,
          icon: 'arrow-outward',
        }"
      />
      <div class="grid gap-sm sm:grid-cols-2">
        <PublicContentCard
          v-for="page in pages"
          :key="page.href"
          :href="page.href"
          :title="page.title"
          :summary="page.summary"
          :label="phrase.page"
          icon="page"
          :date="page.updatedAt"
          :media="page.iconMedia"
          compact
          class="first:sm:col-span-2"
        />
      </div>
    </section>
  </main>
</template>
