<script lang="ts" setup>
import type { ArchivedOriginalFileMeta } from '#layers/thei/shared/asset';
import {
  getAssetMediaKind,
  getAssetMimeType,
} from '#layers/thei/shared/assets/formats';
import { assetPreview } from '#layers/thei/shared/assets/preview';
import { zipEntryBaseName } from '#layers/thei/shared/zip-directory';
import {
  loadFilePreview,
  type FilePreviewView,
} from '#layers/thei/app/composables/file-preview/open';
import {
  blobByteSource,
  urlByteSource,
} from '#layers/thei/app/composables/file-preview/source';
import { useAssetModalActions } from '#layers/thei/app/modals/asset-modal/actions';
import AssetModalButton from '#layers/thei/app/modals/asset-modal/AssetModalButton.vue';
import AssetModalPreviewAudio from '#layers/thei/app/modals/asset-modal/AssetModalPreviewAudio.vue';
import AssetModalPreviewMedia from '#layers/thei/app/modals/asset-modal/AssetModalPreviewMedia.vue';
import FilePreview from '#layers/thei/app/components/FilePreview.vue';
import FilePreviewFrame from './FilePreviewFrame.vue';
import FilePreviewMarkdown from './FilePreviewMarkdown.vue';
import FilePreviewTable from './FilePreviewTable.vue';
import FilePreviewText from './FilePreviewText.vue';
import FilePreviewZip from './FilePreviewZip.vue';
import type { ArchiveFile } from '#layers/thei/app/composables/file-preview/zip';

/**
 * What a file that is no picture, video or recording holds, in its window:
 * the words of a text, a Markdown text as a page, a table, a page of its own
 * in a sandbox, a PDF in the browser's viewer, the files of an archive. Only
 * what is shown is read, a piece at a time, by the browser; a file that
 * shows nothing keeps its card, as before.
 *
 * A file opened out of an archive takes the whole window, as a file of its
 * own would — a picture to zoom and pan, a video with its controls, a page —
 * and the window gets a button back to the archive, where it was left, and
 * one to save that file.
 */
const props = defineProps<{
  /** The file's address in data, without the base path. */
  src?: string;
  /** Or the file itself: picked and not uploaded yet, or out of an archive. */
  file?: Blob;
  extension: string;
  size: number;
  archivedOriginal?: ArchivedOriginalFileMeta;
  /** What a framed page is called for a screen reader. */
  title?: string;
  /** The window steps through files: its pager stands at the top left. */
  paged?: boolean;
}>();

const state = shallowRef<FilePreviewView | { view: 'loading' }>({
  view: 'loading',
});
let run = 0;
let controller: AbortController | undefined;
let revoke: (() => void) | undefined;

function release() {
  controller?.abort();
  controller = undefined;
  revoke?.();
  revoke = undefined;
}

async function load() {
  const mine = ++run;
  release();
  closeEntry();
  const preview = assetPreview(props.extension, props.archivedOriginal);
  if (!preview || (!props.src && !props.file)) {
    state.value = { view: 'none' };
    return;
  }
  state.value = { view: 'loading' };
  // What the file before this one still had on its way stops coming.
  const reading = (controller = new AbortController());
  const result = await loadFilePreview(
    preview,
    props.file
      ? blobByteSource(props.file, reading.signal)
      : urlByteSource(props.src!, props.size, reading.signal),
    {
      pdfUrl: props.src && !preview.archived ? sitePath(props.src) : undefined,
      file: props.file,
    },
  );
  if (mine !== run) {
    if (result.view === 'pdf') result.revoke?.();
    return;
  }
  if (result.view === 'pdf') revoke = result.revoke;
  state.value = result;
}

onMounted(load);
watch(
  () => [
    props.src,
    props.file,
    props.extension,
    props.size,
    props.archivedOriginal?.extension,
  ],
  load,
);
onBeforeUnmount(() => {
  run++;
  release();
  closeEntry();
});

const message = computed(() => {
  const current = state.value;
  if (current.view !== 'error') return '';
  if (current.reason === 'large') return phrase.value.file_preview_too_large;
  if (current.reason === 'no-pdf') return phrase.value.file_preview_no_pdf;
  return phrase.value.file_preview_failed;
});

// A file opened out of the archive.

interface OpenedFile extends ArchiveFile {
  media: ReturnType<typeof getAssetMediaKind>;
  /** What the window shows a picture, a video or a recording from. */
  src?: string;
  /** What it is saved from: bytes no browser renders in a tab of its own. */
  download: string;
}

const entry = shallowRef<OpenedFile>();
const entryMedia =
  useTemplateRef<InstanceType<typeof AssetModalPreviewMedia>>('entryMedia');
let removeEntryLayer: (() => void) | undefined;

async function openEntry(opened: ArchiveFile) {
  closeEntry();
  const media = getAssetMediaKind(opened.extension);
  const typed = new Blob([opened.file], {
    type: getAssetMimeType(opened.extension),
  });
  entry.value = {
    ...opened,
    media,
    // An SVG of an archive is shown from a data address: one of the site's
    // own, a blob, would run its scripts as the site if opened in a tab.
    src:
      media === 'other'
        ? undefined
        : opened.extension === 'svg'
          ? await svgDataUrl(opened.file)
          : URL.createObjectURL(typed),
    download: URL.createObjectURL(
      new Blob([opened.file], { type: 'application/octet-stream' }),
    ),
  };
  // Escape and Back return to the archive first, then close the window.
  removeEntryLayer = registerDismissLayer(closeEntry);
}

function closeEntry() {
  const opened = entry.value;
  if (opened?.src?.startsWith('blob:')) URL.revokeObjectURL(opened.src);
  if (opened) URL.revokeObjectURL(opened.download);
  entry.value = undefined;
  removeEntryLayer?.();
  removeEntryLayer = undefined;
}

function svgDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        String(reader.result).replace(/^data:[^;,]*/, 'data:image/svg+xml'),
      );
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const inWindow = useAssetModalActions(() => {
  const opened = entry.value;
  if (!opened) return [];
  return [
    {
      key: 'archive-back',
      icon: 'arrow-back',
      label: phrase.value.archive_back,
      onClick: closeEntry,
    },
    {
      key: 'archive-download',
      icon: 'download',
      label: phrase.value.archive_entry_download,
      href: opened.download,
      download: zipEntryBaseName(opened.name),
    },
    ...(opened.media === 'image' || opened.media === 'video'
      ? [
          {
            key: 'archive-zoom',
            label: phrase.value.asset_zoom,
            text: `${entryMedia.value?.zoomPercent ?? 100}%`,
            onClick: () => entryMedia.value?.handleZoomButtonClick(),
          },
        ]
      : []),
  ];
});
</script>

<template>
  <FilePreview
    v-if="state.view === 'none'"
    :extension
    class="w-1/2 max-w-132 text-text-2"
  />
  <template v-else>
    <!-- Kept while a file of the archive is open: back, it is where it was. -->
    <div
      v-show="!entry"
      :class="[
        // An even margin round the document, wider only where the window's
        // buttons stand: in a row above on a phone, in a column on the right
        // elsewhere.
        'absolute inset-0 flex flex-col p-sm pt-20 sm:pr-20',
        !paged && 'sm:pt-sm',
      ]"
      data-file-preview
      :data-file-preview-view="state.view"
    >
      <div
        v-if="state.view === 'loading'"
        class="flex flex-1 items-center justify-center text-text-3"
      >
        <Icon name="loading" class="size-8" />
      </div>
      <div
        v-else-if="state.view === 'error'"
        class="flex flex-1 flex-col items-center justify-center gap-md
          text-center"
      >
        <FilePreview :extension class="w-1/3 max-w-60 text-text-2" />
        <p class="max-w-80 text-sm text-text-2">{{ message }}</p>
      </div>
      <FilePreviewText
        v-else-if="state.view === 'text'"
        :text="state.text"
        :shown="state.shown"
        :total="state.total"
      />
      <FilePreviewMarkdown
        v-else-if="state.view === 'markdown'"
        :text="state.text"
      />
      <FilePreviewTable
        v-else-if="state.view === 'table'"
        :rows="state.rows"
        :more="state.more"
      />
      <FilePreviewFrame
        v-else-if="state.view === 'page'"
        :html="state.html"
        :title="title || phrase.file_preview_page"
      />
      <FilePreviewFrame
        v-else-if="state.view === 'pdf'"
        :url="state.url"
        :title="title || phrase.file_preview_page"
      />
      <FilePreviewZip
        v-else-if="state.view === 'zip'"
        :directory="state.directory"
        :source="state.source"
        @open="openEntry"
      />
    </div>

    <template v-if="entry">
      <AssetModalPreviewMedia
        v-if="entry.src && entry.media !== 'audio'"
        ref="entryMedia"
        :key="entry.src"
        :extension="entry.extension"
        :src="entry.src"
      />
      <div
        v-else-if="entry.src"
        class="absolute inset-0 flex items-center justify-center p-sm pt-20
          sm:px-20"
      >
        <AssetModalPreviewAudio
          :players="[
            { key: entry.name, src: entry.src, extension: entry.extension },
          ]"
        />
      </div>
      <!-- A text, a page, a table: shown as the file of its own it is. -->
      <FilePreviewContent
        v-else
        :key="entry.download"
        :file="entry.file"
        :extension="entry.extension"
        :size="entry.file.size"
        :title="zipEntryBaseName(entry.name)"
        :paged
      />
      <!-- Outside a file's window there is no row of buttons to go back by. -->
      <div v-if="!inWindow" class="absolute top-0 left-0 z-10 p-sm">
        <AssetModalButton
          icon="arrow-back"
          :aria-label="phrase.archive_back"
          :data-title-popup="phrase.archive_back"
          @click="closeEntry"
        />
      </div>
    </template>
  </template>
</template>
