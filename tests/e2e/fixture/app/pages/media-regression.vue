<script setup lang="ts">
import type {
  PublicAction,
  PublicAssetDescriptor,
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
  name: 'original-image.svg',
  extension: 'svg',
  size: 50,
  assetUrl: '/regression-image.svg',
  media: {
    kind: 'image',
    src: '/regression-image.svg',
    previewSrc: '/regression-image.svg',
    width: 320,
    height: 180,
    accentHue: 0,
  },
};
const video: ContentAssetData = {
  assetUuid: 'video',
  name: 'original-video.mp4',
  extension: 'mp4',
  size: 20 * 1024 * 1024,
  assetUrl: '/regression-video.mp4',
  media: {
    kind: 'video',
    src: '/regression-video.mp4',
    previewSrc: '/regression-image.svg',
    width: 320,
    height: 180,
    accentHue: 140,
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
const showcase: PublicAssetDescriptor[] = [image, video].map((asset) => ({
  key: asset.assetUuid,
  title: `Showcase ${asset.assetUuid}`,
  fileName: asset.name,
  href: asset.assetUrl!,
  extension: asset.extension!,
  size: asset.size!,
  media: asset.media,
}));
const actions: PublicAction[] = [
  'standard-gradient',
  'accent-gradient',
  'icon-gradient',
  'file-gradient',
  'link-gradient',
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
  backgroundMode: 'file-gradient',
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
    <div
      v-for="action in actions"
      :key="action.text"
      :data-action="action.text"
      class="flex flex-col gap-xs"
    >
      <ProjectActionButton v-bind="action" interactive />
      <PublicAction :action />
    </div>
    <div data-editor><EditorRegression /></div>
    <div class="h-144" />
  </main>
</template>
