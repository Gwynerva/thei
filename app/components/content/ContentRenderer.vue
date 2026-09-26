<script lang="ts" setup>
import {
  type ContentAssetData,
  type ContentExternalLinkData,
  type ContentMediaLayout,
  type PublicContentOutputData,
  type PublicContentOutputBlock,
} from '#layers/thei/shared/content';
import type { ContentLinkResolver } from '#layers/thei/shared/content-link';
import type { ExternalLinkPreview } from '#layers/thei/shared/external-link';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { useContentLinkResolver } from '#layers/thei/app/composables/content-link-resolver';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import ContentInlineLinkDecorator from './ContentInlineLinkDecorator.vue';
import ContentRendererList from './ContentRendererList.vue';
import ContentSpoiler from './ContentSpoiler.vue';
import { openPublicAssets } from '#layers/thei/app/modals/public-asset/modal';
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
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

/** Only an ordinary block can be a spoiler; a private section never is. */
function blockIsSpoiler(block: PublicContentOutputBlock) {
  return 'tunes' in block && block.tunes?.spoiler === true;
}

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

function externalLink(
  value: Record<string, unknown>,
): ExternalLinkPreview | undefined {
  const data = value as ContentExternalLinkData;
  if (!data.faviconMedia) return undefined;
  return {
    url: data.url,
    title: data.title,
    description: data.description,
    faviconMedia: data.faviconMedia,
  };
}

function assetDescriptor(
  value: unknown,
  title?: string,
  description?: string,
): PublicAssetDescriptor | undefined {
  const item = asset(value);
  if (!item.assetUrl || !item.extension) return undefined;
  return {
    key: item.assetUuid,
    title: richTextToPlainText(title ?? ''),
    description: description ? richTextToPlainText(description) : undefined,
    href: item.assetUrl,
    extension: item.extension,
    size: item.size ?? 0,
    media: item.media,
    archivedOriginal: item.archivedOriginal,
  };
}

function openAsset(value: unknown, title?: string, description?: string) {
  if (!props.assetViewer) return;
  const descriptor = assetDescriptor(value, title, description);
  if (descriptor) openPublicAssets([descriptor], descriptor);
}

/** A gallery opens as itself: the viewer steps through its other tiles. */
function openGalleryItem(
  items: ContentGalleryItem[],
  item: ContentGalleryItem,
) {
  if (!props.assetViewer) return;
  const descriptors = items
    .map((tile) => assetDescriptor(tile.asset, tile.caption))
    .filter((descriptor) => descriptor !== undefined);
  openPublicAssets(
    descriptors,
    descriptors.find((descriptor) => descriptor.key === item.asset?.assetUuid),
  );
}
</script>

<template>
  <div ref="root" class="content-renderer content-prose min-w-0">
    <template v-for="{ block, path } in blocks" :key="blockKey(block, path)">
      <ContentSpoiler :spoiler="blockIsSpoiler(block)">
        <p
          v-if="block.type === 'paragraph'"
          v-html="publicRichText(block.data.text as string)"
        ></p>
        <component
          :is="headerTag(block.data.level)"
          v-else-if="block.type === 'header'"
          :id="headingIdByPath.get(path)"
          class="scroll-mt-[var(--public-anchor-offset,8rem)]"
          v-html="publicRichText(block.data.text as string)"
        ></component>
        <ContentRendererList
          v-else-if="block.type === 'list'"
          :items="block.data.items as any[]"
          :style="block.data.style as any"
          :meta="block.data.meta as any"
        />
        <blockquote
          v-else-if="block.type === 'quote'"
          class="content-quote"
          :class="{ 'text-center': block.data.alignment === 'center' }"
        >
          <p
            class="content-quote__text"
            v-html="publicRichText(block.data.text as string)"
          ></p>
          <cite
            v-if="block.data.caption"
            class="content-quote__caption"
            v-html="publicRichText(block.data.caption as string)"
          ></cite>
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
              block.data.caption as string | undefined,
            )
          "
        />
        <ContentGallery
          v-else-if="block.type === 'contentGallery'"
          :items="block.data.items as any[]"
          :choose-label="phrase.content_gallery_tile"
          :openable="assetViewer"
          @open="
            (item: ContentGalleryItem) =>
              openGalleryItem(block.data.items as ContentGalleryItem[], item)
          "
        />
        <ContentAttachmentCard
          v-else-if="
            block.type === 'contentAttachment' &&
            asset(block.data.asset).assetUuid
          "
          :asset="asset(block.data.asset)"
          :title="block.data.title as string | undefined"
          :description="block.data.caption as string | undefined"
          :fallback-title="
            phrase.content_file_with_extension(
              asset(block.data.asset).extension,
            )
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
        <ContentIntegration
          v-else-if="block.type === 'integration'"
          :data="block.data"
        />
        <ContentEntityLinkBlock
          v-else-if="block.type === 'entityLink'"
          :entity-type="block.data.entityType as ContentEntityType"
          :entity-id="block.data.entityId as string | undefined"
          :restricted="block.data.restricted as boolean | undefined"
          :resolver="linkResolver"
        />
        <ContentPrivatePlaceholder
          v-else-if="block.type === 'privateSectionPlaceholder'"
          :summary="block.data"
        />
        <section
          v-else-if="block.type === 'privateSectionExpanded'"
          class="content-private-pattern content-private-section relative
            isolate flex flex-col gap-sm"
        >
          <div
            class="content-private-bracket"
            data-private-section-edge="start"
          >
            <span class="content-private-bracket__label">
              <Icon name="lock-close" aria-hidden="true" />
              <span>{{ phrase.content_private_section_start }}</span>
            </span>
          </div>
          <ContentRenderer
            class="px-sm"
            :data="{ blocks: block.data.blocks }"
            :link-resolver="linkResolver"
            :asset-viewer="assetViewer"
            :content-headings="allHeadings"
            :path-prefix="path"
          />
          <div class="content-private-bracket" data-private-section-edge="end">
            <span class="content-private-bracket__label">
              <Icon name="lock-close" aria-hidden="true" />
              <span>{{ phrase.content_private_section_end }}</span>
            </span>
          </div>
        </section>
      </ContentSpoiler>
    </template>
    <ContentInlineLinkDecorator :root="root" :resolver="linkResolver" />
  </div>
</template>

<style scoped>
/* The pattern spans the content between the bracket lines, not the labels. */
.content-private-section::before {
  inset: 1rem 0;
}
</style>
