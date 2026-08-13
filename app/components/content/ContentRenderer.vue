<script lang="ts" setup>
import { AssetType } from '#layers/thei/shared/asset';
import {
  contentBlockIsPrivate,
  type ContentAssetData,
  type ContentExternalLinkData,
  type ContentMediaLayout,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import ContentInlineLinkDecorator from './ContentInlineLinkDecorator.vue';
import ContentRendererList from './ContentRendererList.vue';

const props = withDefaults(
  defineProps<{
    data: ContentOutputData;
    includePrivate?: boolean;
    linkResolver?: ContentLinkResolver;
  }>(),
  { includePrivate: false },
);

const root = useTemplateRef<HTMLElement>('root');
const blocks = computed(() =>
  props.data.blocks.filter(
    (block) => props.includePrivate || !contentBlockIsPrivate(block),
  ),
);

function headerTag(level: unknown) {
  return level === 3 ? 'h3' : 'h2';
}

function asset(value: unknown) {
  return (value && typeof value === 'object' ? value : {}) as ContentAssetData;
}

function assetMedia(value: unknown) {
  return asset(value).media as MediaDescriptor;
}

function externalLink(value: Record<string, unknown>) {
  const data = value as ContentExternalLinkData;
  return data.faviconMedia
    ? ({ ...data, touchedAt: data.touchedAt ?? 0 } as ExternalLink)
    : undefined;
}

function assetTitle(value: ContentAssetData) {
  return (
    value.name?.replace(/\.[^.]+$/, '') ||
    value.extension?.toUpperCase() ||
    value.assetUuid
  );
}
</script>

<template>
  <div ref="root" class="content-renderer content-prose min-w-0">
    <template v-for="block in blocks" :key="block.id">
      <p v-if="block.type === 'paragraph'" v-html="block.data.text"></p>
      <component
        :is="headerTag(block.data.level)"
        v-else-if="block.type === 'header'"
        v-html="block.data.text"
      ></component>
      <ContentRendererList
        v-else-if="block.type === 'list'"
        :items="block.data.items as any[]"
        :style="block.data.style as any"
      />
      <blockquote
        v-else-if="block.type === 'quote'"
        class="content-quote"
        :class="{ 'text-center': block.data.alignment === 'center' }"
      >
        <p class="content-quote__text" v-html="block.data.text"></p>
        <cite v-if="block.data.caption" class="content-quote__caption">
          {{ block.data.caption }}
        </cite>
      </blockquote>
      <div
        v-else-if="block.type === 'delimiter'"
        class="content-divider"
        role="separator"
      >
        <Icon
          v-for="index in 3"
          :key="index"
          name="asterisk"
          aria-hidden="true"
        />
      </div>
      <figure v-else-if="block.type === 'contentMedia'" class="min-w-0">
        <ContentMedia
          v-if="assetMedia(block.data.asset)"
          :asset="asset(block.data.asset)"
          :layout="block.data.layout as ContentMediaLayout"
        />
        <figcaption v-if="block.data.caption" class="mt-xs text-sm text-text-2">
          <span v-html="block.data.caption"></span>
        </figcaption>
      </figure>
      <div
        v-else-if="block.type === 'contentGallery'"
        class="grid min-w-0 grid-cols-1 gap-xs sm:grid-cols-2"
      >
        <figure
          v-for="item in block.data.items as any[]"
          :key="item.id"
          class="min-w-0"
        >
          <Media
            v-if="assetMedia(item.asset)"
            v-bind="assetMedia(item.asset)"
            class="aspect-video w-full rounded-normal object-cover opacity-100"
          />
          <figcaption v-if="item.caption" class="mt-1 text-xs text-text-2">
            {{ item.caption }}
          </figcaption>
        </figure>
      </div>
      <a
        v-else-if="block.type === 'contentAttachment'"
        :href="asset(block.data.asset).assetUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="flex min-w-0 items-center gap-xs rounded-normal border
          border-border-1 bg-bg-2 p-xs text-text-1 no-underline
          hocus:border-border-3 hocus:bg-bg-3"
      >
        <Icon name="file" class="size-6 shrink-0" />
        <span class="min-w-0 flex-1">
          <strong class="block truncate">
            {{ block.data.title || assetTitle(asset(block.data.asset)) }}
          </strong>
          <span v-if="block.data.description" class="block text-sm text-text-2">
            {{ block.data.description }}
          </span>
        </span>
        <span
          v-if="asset(block.data.asset).type === AssetType.Other"
          class="shrink-0 text-xs text-text-3"
        >
          {{ asset(block.data.asset).extension?.toUpperCase() }}
        </span>
      </a>
      <ExternalLinkPreviewCard
        v-else-if="block.type === 'externalLink'"
        :link="externalLink(block.data)"
        :url="block.data.url as string"
        :interactive="true"
      />
    </template>
    <ContentInlineLinkDecorator
      v-if="linkResolver"
      :root="root"
      :resolver="linkResolver"
    />
  </div>
</template>
