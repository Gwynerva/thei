<script lang="ts" setup>
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
import { useContentLinkResolver } from '#layers/thei/app/composables/content-link-resolver';
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
const defaultLinkResolver = useContentLinkResolver();
const linkResolver = computed(() => props.linkResolver ?? defaultLinkResolver);
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
      <ContentMediaCard
        v-else-if="
          block.type === 'contentMedia' && assetMedia(block.data.asset)
        "
        :asset="asset(block.data.asset)"
        :layout="block.data.layout as ContentMediaLayout"
        :caption="block.data.caption as string | undefined"
      />
      <ContentGallery
        v-else-if="block.type === 'contentGallery'"
        :items="block.data.items as any[]"
        :choose-label="phrase.content_choose_media"
      />
      <ContentAttachmentCard
        v-else-if="block.type === 'contentAttachment'"
        :asset="asset(block.data.asset)"
        :title="block.data.title as string | undefined"
        :description="block.data.caption as string | undefined"
        :fallback-title="
          phrase.content_file_with_extension(asset(block.data.asset).extension)
        "
        :href="asset(block.data.asset).assetUrl"
      />
      <ExternalLinkPreviewCard
        v-else-if="block.type === 'externalLink'"
        :link="externalLink(block.data)"
        :url="block.data.url as string"
        :interactive="true"
      />
    </template>
    <ContentInlineLinkDecorator :root="root" :resolver="linkResolver" />
  </div>
</template>
