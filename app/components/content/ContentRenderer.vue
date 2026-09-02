<script lang="ts" setup>
import {
  type ContentAssetData,
  type ContentExternalLinkData,
  type ContentMediaLayout,
  type PublicContentOutputData,
  type PublicContentOutputBlock,
} from '#layers/thei/shared/content';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { useContentLinkResolver } from '#layers/thei/app/composables/content-link-resolver';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import ContentInlineLinkDecorator from './ContentInlineLinkDecorator.vue';
import ContentRendererList from './ContentRendererList.vue';
import { publicAssetModal } from '#layers/thei/app/modals/public-asset/modal';
import type { ContentGalleryItem } from '#layers/thei/shared/content';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';
import {
  buildContentHeadings,
  visibleContentBlocks,
  type ContentHeading,
} from './content-headings';

const props = withDefaults(
  defineProps<{
    data: PublicContentOutputData;
    linkResolver?: ContentLinkResolver;
    assetViewer?: boolean;
    contentHeadings?: ContentHeading[];
    pathPrefix?: string;
  }>(),
  { pathPrefix: '' },
);

const root = useTemplateRef<HTMLElement>('root');
const defaultLinkResolver = useContentLinkResolver();
const linkResolver = computed(() => props.linkResolver ?? defaultLinkResolver);
const blocks = computed(() =>
  visibleContentBlocks(props.data, props.pathPrefix),
);
const allHeadings = computed(
  () =>
    props.contentHeadings ??
    buildContentHeadings(props.data, language.value.slugify),
);
const headingIdByPath = computed(
  () => new Map(allHeadings.value.map((heading) => [heading.path, heading.id])),
);

function blockKey(block: PublicContentOutputBlock, path: string) {
  return 'id' in block && block.id ? block.id : `${block.type}-${path}`;
}

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

function openAsset(value: unknown, title?: string, description?: string) {
  if (!props.assetViewer) return;
  const item = asset(value);
  if (!item.assetUrl || !item.extension) return;
  void openModal(publicAssetModal, {
    key: item.assetUuid,
    title: richTextToPlainText(title || item.name || item.assetUuid),
    description: description ? richTextToPlainText(description) : undefined,
    href: item.assetUrl,
    extension: item.extension,
    size: item.size ?? 0,
    media: item.media,
    archivedOriginal: item.archivedOriginal,
  });
}

function openGalleryItem(item: ContentGalleryItem) {
  openAsset(item.asset, item.asset.name, item.caption);
}
</script>

<template>
  <div ref="root" class="content-renderer content-prose min-w-0">
    <template v-for="{ block, path } in blocks" :key="blockKey(block, path)">
      <p v-if="block.type === 'paragraph'" v-html="block.data.text"></p>
      <component
        :is="headerTag(block.data.level)"
        v-else-if="block.type === 'header'"
        :id="headingIdByPath.get(path)"
        class="scroll-mt-32"
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
        :openable="assetViewer"
        @open="
          openAsset(
            block.data.asset,
            asset(block.data.asset).name,
            block.data.caption as string | undefined,
          )
        "
      />
      <ContentGallery
        v-else-if="block.type === 'contentGallery'"
        :items="block.data.items as any[]"
        :choose-label="phrase.content_choose_media"
        :openable="assetViewer"
        @open="openGalleryItem"
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
        :openable="assetViewer"
        @open="
          openAsset(
            block.data.asset,
            block.data.title as string | undefined,
            block.data.caption as string | undefined,
          )
        "
      />
      <ExternalLinkPreviewCard
        v-else-if="block.type === 'externalLink'"
        :link="externalLink(block.data)"
        :url="block.data.url as string"
        :interactive="true"
      />
      <ContentEntityLinkBlock
        v-else-if="block.type === 'entityLink'"
        :entity-type="block.data.entityType as 'project' | 'event' | 'page'"
        :entity-id="block.data.entityId as string"
        :resolver="linkResolver"
      />
      <section
        v-else-if="block.type === 'privateSectionPlaceholder'"
        class="content-private-section content-private-section--placeholder
          relative isolate flex flex-col gap-xs overflow-hidden rounded-normal
          border border-accent/20 bg-bg-accent/30 px-sm py-sm"
      >
        <span class="inline-flex items-center gap-xs font-medium text-accent">
          <Icon name="lock-close" aria-hidden="true" />
          {{ phrase.content_private_section }}
        </span>
        <ContentStats v-bind="block.data" />
      </section>
      <section
        v-else-if="block.type === 'privateSectionExpanded'"
        class="content-private-section relative isolate flex flex-col gap-sm
          overflow-hidden rounded-normal border border-accent/20 bg-bg-accent/20
          px-sm py-sm"
      >
        <span
          class="inline-flex items-center gap-xs text-xs font-medium
            text-accent"
        >
          <Icon name="lock-close" aria-hidden="true" />
          {{ phrase.content_private_section }}
        </span>
        <ContentRenderer
          :data="{ blocks: block.data.blocks }"
          :link-resolver="linkResolver"
          :asset-viewer="assetViewer"
          :content-headings="allHeadings"
          :path-prefix="path"
        />
      </section>
    </template>
    <ContentInlineLinkDecorator :root="root" :resolver="linkResolver" />
  </div>
</template>

<style scoped>
.content-private-section::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--color-accent);
  content: '';
  opacity: 0.055;
  pointer-events: none;
  mask-image:
    url("data:image/svg+xml,%3Csvg width='18' height='20' viewBox='0 0 18 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 8V6A5 5 0 0 0 4 6v2H2v10h14V8h-2ZM6 6a3 3 0 0 1 6 0v2H6V6Zm8 10H4v-6h10v6Z' fill='black'/%3E%3C/svg%3E"),
    linear-gradient(
      to right,
      transparent,
      black var(--spacing-md),
      black calc(100% - var(--spacing-md)),
      transparent
    ),
    linear-gradient(
      to bottom,
      transparent,
      black var(--spacing-md),
      black calc(100% - var(--spacing-md)),
      transparent
    );
  mask-position:
    0 0,
    0 0,
    0 0;
  mask-size:
    2rem 2rem,
    100% 100%,
    100% 100%;
  mask-repeat: repeat, no-repeat, no-repeat;
  mask-composite: intersect, intersect;
}

.content-private-section--placeholder::before {
  opacity: 0.035;
}
</style>
