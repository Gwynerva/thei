<script setup lang="ts">
import type {
  PublicAction,
  PublicAssetDescriptor,
  PublicSecretReference,
} from '#layers/thei/shared/api/public';
import type {
  ContentAssetData,
  PublicContentOutputData,
} from '#layers/thei/shared/content';
import { DEFAULT_PROJECT_ACTION } from '#layers/thei/shared/project-action';
import EditorRegression from './editor-regression.vue';

definePageMeta({ layout: 'public' });

const image: ContentAssetData = {
  assetUuid: 'image',
  extension: 'svg',
  size: 50,
  assetUrl: '/regression-image.svg',
  media: {
    kind: 'image',
    src: '/regression-image.svg',
    previewSrc: '/regression-image.svg',
    width: 320,
    height: 180,
    accent: { hue: 0, chroma: 0.15 },
  },
};
const video: ContentAssetData = {
  assetUuid: 'video',
  extension: 'mp4',
  size: 20 * 1024 * 1024,
  assetUrl: '/regression-video.mp4',
  media: {
    kind: 'video',
    src: '/regression-video.mp4',
    previewSrc: '/regression-image.svg',
    width: 320,
    height: 180,
    accent: { hue: 140, chroma: 0.15 },
  },
};
const slowImage: ContentAssetData = {
  ...image,
  assetUuid: 'slow-image',
  assetUrl: '/slow-image.svg',
  media: {
    ...image.media!,
    src: '/slow-image.svg',
    previewSrc: '/slow-image.svg',
  },
};
const content: PublicContentOutputData = {
  blocks: [
    {
      type: 'contentMedia',
      data: {
        asset: image,
        layout: 'natural',
        caption: '<b>Image caption</b>',
      },
    },
    {
      type: 'contentMedia',
      data: { asset: video, layout: 'centered', caption: 'Video caption' },
    },
    {
      type: 'contentGallery',
      data: {
        items: [
          { id: 'image', asset: image, caption: '<i>Gallery caption</i>' },
          { id: 'video', asset: video, caption: 'Gallery video' },
          { id: 'slow', asset: slowImage, caption: 'Slow gallery' },
        ],
      },
    },
    { type: 'contentMedia', data: { asset: image, layout: 'stretch' } },
    {
      type: 'contentAttachment',
      data: {
        asset: { ...image, media: undefined },
        title: 'Document title',
        caption: 'Document description',
      },
    },
    {
      type: 'privateSectionExpanded',
      data: {
        summary: {
          blockCount: 1,
          wordCount: 0,
          assetCount: 1,
          assetTotalSize: 50,
        },
        blocks: [
          {
            type: 'contentMedia',
            data: {
              asset: image,
              layout: 'centered',
              caption: 'Nested caption',
            },
          },
        ],
      },
    },
  ],
};
const showcase: PublicAssetDescriptor[] = [image, video, slowImage].map(
  (asset) => ({
    key: asset.assetUuid,
    title: `Showcase ${asset.assetUuid}`,
    href: asset.assetUrl!,
    extension: asset.extension!,
    size: asset.size!,
    media: asset.media,
  }),
);
const secret: PublicSecretReference = {
  secret: true,
  key: 'secret-media',
  title: 'Secret media Gamma',
  iconMedia: image.media!,
};
const withSecret = [secret, ...showcase];
const actions: PublicAction[] = [
  'standard-gradient',
  'auto-gradient',
  'accent-gradient',
  'asset',
].map((backgroundMode) => ({
  ...DEFAULT_PROJECT_ACTION,
  text: backgroundMode,
  backgroundMode: backgroundMode as PublicAction['backgroundMode'],
  href: '#',
  accentColor: '#123456',
  target: 'file',
  useFavicon: false,
  iconMedia: image.media,
  fileMedia: video.media,
  faviconMedia: image.media,
  backgroundMedia: image.media,
}));
actions.push({
  ...actions[0]!,
  text: 'missing-color',
  backgroundMode: 'auto-gradient',
  iconMedia: undefined,
  fileMedia: undefined,
});
</script>

<template>
  <main class="mx-auto flex w-full max-w-180 flex-col gap-lg p-sm">
    <div data-renderer><ContentRenderer :data="content" asset-viewer /></div>
    <div data-showcase>
      <PublicAssetGallery :items="showcase" variant="hero" />
    </div>
    <div data-default-gallery><PublicAssetGallery :items="showcase" /></div>
    <div data-files>
      <PublicFiles
        :files="[
          {
            ...showcase[0]!,
            title: 'Listed file',
            description: 'Listed description',
          },
        ]"
      />
    </div>
    <div data-secrets class="flex flex-col gap-sm">
      <PublicAssetGallery :items="withSecret" variant="hero" />
      <PublicAssetGallery :items="withSecret" />
      <PublicFiles :files="[{ ...secret, title: 'Secret file Delta' }]" />
    </div>
    <div
      v-for="action in actions"
      :key="action.text"
      :data-action="action.text"
      class="flex flex-col gap-xs"
    >
      <ProjectActionButton v-bind="action" preview />
      <PublicAction :action />
    </div>
    <div data-editor><EditorRegression /></div>
    <div class="h-144" />
  </main>
</template>
