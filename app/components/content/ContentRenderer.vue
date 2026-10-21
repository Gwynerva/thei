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
import type {
  ContentFileGroupItem,
  ContentGalleryItem,
} from '#layers/thei/shared/content';
import { AssetType } from '#layers/thei/shared/asset';
import { contentFileOpensInViewer } from './content-file-card';
import type { ContentFileGroupEntry } from './file-group-state';
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
    /** Spoilers drawn open: a text compared, whose change must be seen. */
    spoilersOpen?: boolean;
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

/**
 * Where a link may land in the text: the search leads to a block by its
 * `#b-<id>` (`app/composables/search-landing.ts`).
 */
function blockAnchor(block: PublicContentOutputBlock) {
  return 'id' in block && block.id ? { 'data-block': block.id } : {};
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

/** A link block's note: the last line of its card. */
function linkNote(value: Record<string, unknown>) {
  return typeof value.note === 'string' ? value.note : undefined;
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

/**
 * A file as the viewer shows it: the title the text gives it, and its
 * caption with the marks it was written with. Its key is the file's public
 * id, which the window asks the file's other places by.
 */
function assetDescriptor(
  value: unknown,
  words: { title?: string; caption?: string } = {},
): PublicAssetDescriptor | undefined {
  const item = asset(value);
  if (!item.assetUrl || !item.extension) return undefined;
  return {
    key: item.assetUuid,
    title: words.title ?? '',
    caption: words.caption || undefined,
    href: item.assetUrl,
    extension: item.extension,
    size: item.size ?? 0,
    media: item.media,
    archivedOriginal: item.archivedOriginal,
    alt: item.alt,
  };
}

function openAsset(value: unknown, title?: string, caption?: string) {
  if (!props.assetViewer) return;
  const descriptor = assetDescriptor(value, { title, caption });
  if (descriptor) openPublicAssets([descriptor], descriptor);
}

/** A gallery opens as itself: the viewer steps through its other tiles. */
function openGalleryItem(
  items: ContentGalleryItem[],
  item: ContentGalleryItem,
) {
  if (!props.assetViewer) return;
  openPublicAssetSet(
    items.map((tile) => ({
      tile,
      descriptor: assetDescriptor(tile.asset, { caption: tile.caption }),
    })),
    item,
  );
}

/**
 * Opens the files of a set at the one pressed. One file may stand twice in a
 * set, so the pressed one is found by its place, not by the file.
 */
function openPublicAssetSet<T>(
  entries: { tile: T; descriptor: PublicAssetDescriptor | undefined }[],
  pressed: T,
) {
  const shown = entries.filter(
    (entry): entry is { tile: T; descriptor: PublicAssetDescriptor } =>
      entry.descriptor !== undefined,
  );
  openPublicAssets(
    shown.map((entry) => entry.descriptor),
    shown.find((entry) => entry.tile === pressed)?.descriptor,
  );
}

/**
 * A group opens as a set too, of the files in it the viewer shows: its
 * recordings play in place, and a file with nothing to show is downloaded.
 */
function openFileGroupItem(
  items: ContentFileGroupItem[],
  item: ContentFileGroupItem,
) {
  if (!props.assetViewer) return;
  openPublicAssetSet(
    items
      .filter(
        (file) =>
          file.asset.type !== AssetType.Audio &&
          contentFileOpensInViewer(file.asset),
      )
      .map((file) => ({
        tile: file,
        descriptor: assetDescriptor(file.asset, {
          title: file.title,
          caption: file.caption,
        }),
      })),
    item,
  );
}

function fileGroupEntries(items: unknown): ContentFileGroupEntry[] {
  return (Array.isArray(items) ? (items as ContentFileGroupItem[]) : []).map(
    (item) => ({ id: item.id, item }),
  );
}
</script>

<template>
  <div ref="root" class="content-renderer content-prose min-w-0">
    <template v-for="{ block, path } in blocks" :key="blockKey(block, path)">
      <ContentSpoiler :spoiler="!spoilersOpen && blockIsSpoiler(block)">
        <p
          v-if="block.type === 'paragraph'"
          v-bind="blockAnchor(block)"
          v-html="publicRichText(block.data.text as string)"
        ></p>
        <component
          :is="headerTag(block.data.level)"
          v-else-if="block.type === 'header'"
          v-bind="blockAnchor(block)"
          :id="headingIdByPath.get(path)"
          class="scroll-mt-[var(--public-anchor-offset,8rem)]"
          v-html="publicRichText(block.data.text as string)"
        ></component>
        <ContentRendererList
          v-else-if="block.type === 'list'"
          v-bind="blockAnchor(block)"
          :items="block.data.items as any[]"
          :list-style="block.data.style as any"
          :meta="block.data.meta as any"
        />
        <blockquote
          v-else-if="block.type === 'quote'"
          v-bind="blockAnchor(block)"
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
          v-bind="blockAnchor(block)"
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
          v-bind="blockAnchor(block)"
          :asset="asset(block.data.asset)"
          :layout="block.data.layout as ContentMediaLayout"
          :caption="block.data.caption as string | undefined"
          :openable="assetViewer"
          @open="
            openAsset(
              block.data.asset,
              undefined,
              block.data.caption as string | undefined,
            )
          "
        />
        <ContentGallery
          v-else-if="block.type === 'contentGallery'"
          v-bind="blockAnchor(block)"
          :title="block.data.title as string | undefined"
          :items="block.data.items as any[]"
          :choose-label="phrase.content_gallery_tile"
          :openable="assetViewer"
          @open="
            (item: ContentGalleryItem) =>
              openGalleryItem(block.data.items as ContentGalleryItem[], item)
          "
        />
        <ContentAudioCard
          v-else-if="
            block.type === 'contentAudio' && asset(block.data.asset).assetUrl
          "
          v-bind="blockAnchor(block)"
          :asset="asset(block.data.asset)"
          :title="block.data.title as string | undefined"
          :caption="block.data.caption as string | undefined"
        />
        <ContentAttachmentCard
          v-else-if="
            block.type === 'contentAttachment' &&
            asset(block.data.asset).assetUuid
          "
          v-bind="blockAnchor(block)"
          :asset="asset(block.data.asset)"
          :title="block.data.title as string | undefined"
          :caption="block.data.caption as string | undefined"
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
        <ContentFileGroup
          v-else-if="block.type === 'contentFileGroup'"
          v-bind="blockAnchor(block)"
          :title="block.data.title as string | undefined"
          :entries="fileGroupEntries(block.data.items)"
          :openable="assetViewer"
          :fallback-title="phrase.content_file_with_extension"
          @open="
            (item: ContentFileGroupItem) =>
              openFileGroupItem(
                block.data.items as ContentFileGroupItem[],
                item,
              )
          "
        />
        <ExternalLinkPreviewCard
          v-else-if="block.type === 'externalLink'"
          v-bind="blockAnchor(block)"
          :link="externalLink(block.data)"
          :url="block.data.url as string"
          :note="linkNote(block.data)"
          :interactive="true"
        />
        <ContentIntegration
          v-else-if="block.type === 'integration'"
          v-bind="blockAnchor(block)"
          :data="block.data"
        />
        <ContentEntityLinkBlock
          v-else-if="block.type === 'entityLink'"
          v-bind="blockAnchor(block)"
          :entity-type="block.data.entityType as ContentEntityType"
          :entity-id="block.data.entityId as string | undefined"
          :restricted="block.data.restricted as boolean | undefined"
          :fragment="block.data.fragment as string | undefined"
          :resolver="linkResolver"
          :note="linkNote(block.data)"
        />
        <ContentPrivatePlaceholder
          v-else-if="block.type === 'privateSectionPlaceholder'"
          v-bind="blockAnchor(block)"
          :summary="block.data"
        />
        <section
          v-else-if="block.type === 'privateSectionExpanded'"
          v-bind="blockAnchor(block)"
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
