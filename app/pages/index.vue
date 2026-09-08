<script lang="ts" setup>
import type { LifeLatestResponse } from '#layers/thei/shared/life';

definePageMeta({ layout: 'public' });

const publicAdmin = await usePublicAdmin();
const latestResource = await useFetch<LifeLatestResponse>('/api/life/latest', {
  query: { limit: 3 },
});
const latest = useRequiredResource(latestResource);

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
          compact
          class="first:sm:col-span-2"
        />
      </div>
      <PublicEmptyState v-else icon="heart" :title="phrase.life_empty" />
    </section>
  </main>
</template>
