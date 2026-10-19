<script lang="ts" setup>
import AssetModal from '#layers/thei/app/modals/asset-modal/AssetModal.vue';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalFileInfo from '#layers/thei/app/modals/asset-modal/AssetModalFileInfo.vue';
import AssetModalPager from '#layers/thei/app/modals/asset-modal/AssetModalPager.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import AssetPanelSection from '#layers/thei/app/modals/asset-modal/AssetPanelSection.vue';
import AssetPlaceChip from '#layers/thei/app/modals/asset-modal/AssetPlaceChip.vue';
import FilePreviewContent from '#layers/thei/app/components/file-preview/FilePreviewContent.vue';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';
import { useContentLinkResolver } from '#layers/thei/app/composables/content-link-resolver';
import { isAssetExtensionSafeInline } from '#layers/thei/shared/assets/formats';
import type { PublicFilePlace } from '#layers/thei/shared/api/public';
import {
  assetFormatLabel,
  assetKindIcon,
  assetSourceIcon,
  assetSourceTitle,
  assetUseLabel,
} from '#layers/thei/app/composables/asset-library-labels';
import { assetTypeOfExtension } from '#layers/thei/shared/content-file-placement';
import type { PublicAssetModalData } from './modal';

const props = defineProps<{ modalData: PublicAssetModalData }>();
const aside = useTemplateRef<HTMLElement>('aside');
const linkResolver = useContentLinkResolver();

/**
 * Which of the files is shown. Kept here rather than reopening the viewer for
 * each step: every open modal holds an entry in the browser history, and a
 * gallery walked through file by file would fill the Back button with it.
 */
const index = ref(
  Math.min(props.modalData.start ?? 0, props.modalData.items.length - 1),
);
const count = computed(() => props.modalData.items.length);
const current = computed(() => props.modalData.items[index.value]!);
/** The file's title, or, without one, what it is: «Документ PDF». */
const name = computed(
  () =>
    publicText(current.value.title) ||
    assetFormatLabel(current.value.extension, current.value.archivedOriginal),
);

function step(delta: number) {
  if (count.value < 2) return;
  index.value = (index.value + delta + count.value) % count.value;
}
useArrowKeys({ previous: () => step(-1), next: () => step(1) });

const mediaPreview =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('mediaPreview');
const dimensions = computed(() => {
  const { width, height } = current.value.media ?? {};
  return width && height ? { width, height } : undefined;
});
/** A browser opens the file in a tab of its own; any other is downloaded. */
const opensInTab = computed(
  () =>
    !!current.value.media ||
    isAssetExtensionSafeInline(current.value.extension),
);

/**
 * The other pages the file is shown on, to go on to: only those anyone may
 * find, where a stranger sees it too (`server/thei/public/file-places.ts`).
 * The page the window was opened over is the one the visitor is on.
 */
const { data: placesData } = useFetch<{ places: PublicFilePlace[] }>(
  () => `/api/files/${encodeURIComponent(current.value.key)}/places`,
  { server: false, lazy: true },
);
const route = useRoute();
const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);
const places = computed(() =>
  (placesData.value?.places ?? []).filter(
    (place) => withSlash(place.href) !== withSlash(route.path),
  ),
);

/**
 * A place opens where the visitor is: the windows close and let go of the
 * history, then the page goes on. A click asking for a new tab is the
 * browser's.
 */
async function goTo(event: MouseEvent, href: string) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  while (activeModal.value && (await closeModalAndWait()));
  await modalHistorySettled();
  await navigateTo(href);
}
</script>

<template>
  <AssetModal
    :aside-title="name"
    :aside-icon="assetKindIcon[assetTypeOfExtension(current.extension)]"
    title-strong
  >
    <template #preview>
      <AssetModalPreviewMedia
        v-if="current.media"
        ref="mediaPreview"
        :key="current.key"
        :extension="current.extension"
        :src="current.media.src"
        :poster="videoPosterOf(current.media)"
        :has-audio="current.media.hasAudio"
        :display-dimensions="dimensions"
      />
      <FilePreviewContent
        v-else
        :key="current.key"
        :src="current.href"
        :extension="current.extension"
        :size="current.size"
        :archived-original="current.archivedOriginal"
        :title="name"
        :paged="count > 1"
      />
    </template>
    <template v-if="count > 1" #nav>
      <AssetModalPager
        :index="index"
        :count="count"
        @previous="step(-1)"
        @next="step(1)"
      />
    </template>
    <template #buttons>
      <AssetModalButton
        v-if="opensInTab"
        icon="arrow-outward"
        target="_blank"
        :href="sitePath(current.href)"
        :data-title-popup="phrase.direct_link_to_asset"
        :aria-label="phrase.direct_link_to_asset"
      />
      <AssetModalButton
        v-if="!current.media"
        icon="download"
        download
        :href="sitePath(current.href)"
        :data-title-popup="phrase.download_asset"
        :aria-label="phrase.download_asset"
        data-asset-download
      />
      <AssetModalButton
        v-if="current.media"
        @click="mediaPreview?.handleZoomButtonClick()"
      >
        <span class="text-xs font-bold"
          >{{ mediaPreview?.zoomPercent ?? 100 }}%</span
        >
      </AssetModalButton>
    </template>
    <template #aside>
      <div ref="aside" class="flex flex-col divide-y divide-border-1 text-sm">
        <!-- A text's caption keeps its marks, links and hints, which work
             here as they do on the page. Keyed by its place: one file may
             stand twice in a set, captioned differently. -->
        <AssetPanelSection v-if="current.caption" :key="`caption:${index}`">
          <p
            class="content-prose leading-relaxed wrap-anywhere text-text-1"
            data-public-asset-caption
            v-html="publicRichText(current.caption)"
          ></p>
        </AssetPanelSection>
        <AssetPanelSection v-else-if="current.description">
          <p class="leading-relaxed wrap-anywhere text-text-1">
            {{ publicText(current.description) }}
          </p>
        </AssetPanelSection>
        <!-- The file itself: what it shows, said for whoever cannot see it,
             and what it is. -->
        <AssetPanelSection
          :key="`file:${current.key}`"
          :title="phrase.asset_about"
        >
          <p
            v-if="current.alt"
            class="leading-relaxed wrap-anywhere whitespace-pre-line
              text-text-2"
            data-public-asset-description
          >
            {{ publicText(current.alt) }}
          </p>
          <AssetModalFileInfo
            :extension="current.extension"
            :size="current.size"
            :dimensions="dimensions"
            :archived-original="current.archivedOriginal"
          />
        </AssetPanelSection>
        <AssetPanelSection
          v-if="places.length"
          :key="`places:${current.key}`"
          :title="phrase.asset_used_elsewhere"
          :count="places.length"
          data-asset-places
        >
          <div class="flex flex-col gap-1.5">
            <AssetPlaceChip
              v-for="place in places"
              :key="place.href"
              :href="place.href"
              :media="place.media"
              :icon="assetSourceIcon[place.kind]"
              :title="
                assetSourceTitle({ type: place.kind, title: place.title })
              "
              :parent="
                place.parent ? publicText(place.parent.title) : undefined
              "
              :uses="
                place.uses
                  .map((use) => assetUseLabel(use, place.kind))
                  .join(' · ')
              "
              @click="goTo($event, place.href)"
            />
          </div>
        </AssetPanelSection>
      </div>
      <ContentInlineLinkDecorator :root="aside" :resolver="linkResolver" />
    </template>
  </AssetModal>
</template>
