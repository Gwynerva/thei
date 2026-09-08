<script setup lang="ts">
import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { PublicTagSummary } from '#layers/thei/shared/api/public';
import type { ContentFieldModelValue } from '#layers/thei/shared/content';

definePageMeta({ layout: 'public' });
const route = useRoute();
const scenario = ref(String(route.query.banner || 'wide'));
const dimensions: Record<string, [number, number]> = {
  wide: [640, 180],
  portrait: [180, 480],
  square: [240, 240],
  transparent: [240, 240],
};
function image(name: string): MediaDescriptor {
  const size = dimensions[name];
  return {
    kind: 'image',
    src: `/ambient-${name}.svg`,
    previewSrc: `/ambient-${name}.svg`,
    width: size?.[0],
    height: size?.[1],
    accent: { hue: 140, chroma: 0.15 },
  };
}
const icon = image('transparent');
const banner = computed<MediaDescriptor | undefined>(() => {
  if (scenario.value === 'none') return undefined;
  if (scenario.value === 'video' || scenario.value === 'no-preview') {
    return {
      kind: 'video',
      src: '/regression-video.mp4',
      previewSrc: scenario.value === 'no-preview' ? '' : '/ambient-square.svg',
      accent: { hue: 140, chroma: 0.15 },
    };
  }
  if (scenario.value === 'slow' || scenario.value === 'error') {
    return { ...image(scenario.value), previewSrc: '/ambient-square.svg' };
  }
  if (scenario.value === 'missing-preview') {
    return { ...image('wide'), previewSrc: '/ambient-error.svg' };
  }
  return image(scenario.value);
});
const tags: PublicTagSummary[] = Array.from(
  { length: Number(route.query.tags ?? 4) },
  (_, index) => ({
    title: `Tag ${index + 1}`,
    slug: `tag-${index + 1}`,
    publicId: `${index + 1}`,
  }),
);
const showcase = [
  {
    key: 'image',
    title: 'Showcase image',
    href: icon.src,
    extension: 'svg',
    size: 100,
    media: icon,
  },
];
const fieldValue = computed<ContentFieldModelValue>(() => ({
  data: { blocks: [{ type: 'contentMedia', data: {
    asset: { assetUuid: 'ambient-preview', media: banner.value }, layout: 'centered',
  } }] },
}));
</script>

<template>
  <main>
    <PublicProjectHero
      title="Project with a long title to verify the banner layout"
      summary="A description that stays readable while the media loads and plays."
      :icon-media="icon"
      :banner-media="banner"
      :showcase="showcase"
      :tags="tags"
      :is-showcase="true"
      :is-portfolio="true"
      data-test-hero
    />
    <button class="m-sm p-sm" data-switch-source @click="scenario = 'portrait'">
      Change source
    </button>
    <button
      class="m-sm p-sm"
      data-switch-preview
      @click="scenario = 'no-preview'"
    >
      Remove video preview
    </button>
    <div class="mx-auto grid w-full max-w-180 gap-sm p-sm" data-cards>
      <PublicContentCard
        href="#"
        title="Public card"
        summary="Project, page or event"
        date="2026-09-02"
        :media="banner"
      />
      <AdminEntityListItem
        entity-type="project"
        title="Admin card"
        summary="Project, page or event"
        edit-to="#"
        :preview-media="banner"
      />
      <ContentProjectLinkPreviewCard
        title="Internal link"
        summary="Project, page or event"
        :icon-media="banner"
        :interactive="false"
      />
    </div>
    <div class="mx-auto grid max-w-180 gap-sm p-sm" data-admin-previews>
      <FieldContentEditor :model-value="fieldValue" data-test-field />
      <AssetTile :media="banner" class="size-24" @click="() => undefined" data-test-tile>
        <template #overlay><button type="button" data-test-nested>Details</button></template>
      </AssetTile>
      <ContentProjectLinkPreviewCard
        title="Editor link" summary="Hover or focus to play" :icon-media="banner"
        playback="interaction" :interactive="false" data-test-editor-link
      />
    </div>
    <button type="button" data-clear-focus>Leave previews</button>
    <div style="height: 200vh" />
    <p data-below>Below the media</p>
  </main>
</template>
