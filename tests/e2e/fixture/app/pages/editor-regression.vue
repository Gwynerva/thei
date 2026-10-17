<script setup lang="ts">
import type EditorJS from '@editorjs/editorjs';
import {
  PrivateSectionBoundaryTool,
  ContentAttachmentTool,
  ContentAudioTool,
  ContentFileGroupTool,
  ContentMediaTool,
  ContentGalleryTool,
  type ContentEditorPickedFiles,
  type ContentEditorUploads,
} from '#layers/thei/app/components/content/editor-tools';
import { ContentDelimiterTool } from '#layers/thei/app/components/content/editor-delimiter-tool';
import { bindEditorGutterClick } from '#layers/thei/app/composables/editor-gutter-click';
import { bindEditorCurrentBlock } from '#layers/thei/app/composables/editor-current-block';
import { bindEditorLinkPaste } from '#layers/thei/app/composables/editor-link-paste';
import { bindEditorFilePaste } from '#layers/thei/app/composables/editor-file-paste';
import { bindEditorPlainFields } from '#layers/thei/app/composables/editor-plain-fields';
import { createEditorPrivateSections } from '#layers/thei/app/composables/editor-private-sections';
import { createEditorPrivatePattern } from '#layers/thei/app/composables/editor-private-pattern';
import { readCleanEditorOutput } from '#layers/thei/app/composables/editor-output';
import { createEditorHistorySession } from '#layers/thei/app/composables/content-history/session';
import type { ContentHistoryTransport } from '#layers/thei/app/composables/content-history/api';
import {
  acceptedExtensionsFromAccept,
  contentAssetFromVariant,
  launchPendingFileEditor,
} from '#layers/thei/app/composables/asset-wizard';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import { AssetType } from '#layers/thei/shared/asset';
import {
  anyFileExtensionProfile,
  audioExtensionProfile,
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type {
  ContentAssetData,
  ContentOutputData,
} from '#layers/thei/shared/content';

const holder = useTemplateRef<HTMLElement>('holder');
const ready = ref(false);
const events = ref(0);
const currentKey = ref('');
const savedKey = ref('');
const transitions = ref<string[]>([]);
const dirty = computed(() => currentKey.value !== savedKey.value);
watch(dirty, (value) => transitions.value.push(value ? 'Save' : 'Saved'), {
  flush: 'sync',
});
let editor: EditorJS;
let unbindGutterClick: (() => void) | undefined;
let unbindCurrentBlock: (() => void) | undefined;
const picture = (id: string): ContentAssetData => ({
  assetUuid: id,
  type: AssetType.Image,
  extension: 'svg',
  size: 1,
  media: {
    kind: 'image',
    src: '/slow-image.svg',
    previewSrc: '/slow-image.svg',
  },
});
/** The picker of a file block, open until "Choose picture" answers it. */
let answerPick: ((asset: ContentAssetData | null) => void) | undefined;
const picking = ref(false);
/** Pasted files are stored for real, through the fixture's own server. */
const uploadErrors = ref<string[]>([]);
const pendingUploads = ref(0);
/** New files go up as the editor sends them, to the limits of their block. */
function uploadsTo(
  accept: Parameters<typeof acceptedExtensionsFromAccept>[0],
  sizeLimitPolicy: 'media' | 'file',
): ContentEditorUploads {
  const maxSize = ASSET_UPLOAD_LIMITS[sizeLimitPolicy];
  return {
    constraints: {
      maxSize,
      sizeLimitPolicy,
      acceptedExtensions: acceptedExtensionsFromAccept(accept),
    },
    editPending: async (pending) => {
      const edited = await launchPendingFileEditor(pending, {
        accept,
        sizeLimitPolicy,
        maxSize,
      });
      return edited ? contentAssetFromVariant(edited) : undefined;
    },
    track: (delta) => {
      pendingUploads.value += delta;
    },
  };
}
const fileToolConfig = (uploads: ContentEditorUploads) => ({
  pickFiles: () =>
    new Promise<ContentEditorPickedFiles>((resolve) => {
      picking.value = true;
      answerPick = (asset) =>
        resolve({ assets: asset ? [asset] : [], files: [] });
    }),
  editAsset: async () => undefined,
  uploads,
});
const mediaToolConfig = fileToolConfig(
  uploadsTo([imageExtensionProfile, videoExtensionProfile], 'media'),
);
/** Recordings: a file's limit, sound only. */
const audioToolConfig = fileToolConfig(
  uploadsTo(audioExtensionProfile, 'file'),
);
const anyFileToolConfig = fileToolConfig(
  uploadsTo(anyFileExtensionProfile, 'file'),
);
let unbindLinkPaste: (() => void) | undefined;
let unbindFilePaste: (() => void) | undefined;
let unbindPlainFields: (() => void) | undefined;
let cleanupPrivatePattern: (() => void) | undefined;
let sections: ReturnType<typeof createEditorPrivateSections>;
let snapshots: ReturnType<typeof createEditorHistorySession>;
const snapshotPending = computed(() => snapshots?.isPending.value ?? false);
/** Every write the session sent, as its hint or "plain". */
const historyWrites = ref<string[]>([]);
const transport: ContentHistoryTransport = {
  sync: async (request) => {
    historyWrites.value.push(request.hint ?? 'plain');
    return { draft: null, others: [] };
  },
  discard: async () => ({ draft: null, others: [] }),
  dismiss: async () => undefined,
  index: async () => ({ drafts: [], revisions: [] }),
  entry: async () => {
    throw new Error('No entries in the fixture');
  },
  drafts: async () => [],
};
const initial: ContentOutputData = {
  blocks: [
    { id: 'p0', type: 'paragraph', data: { text: 'Before' } },
    {
      id: 's1',
      type: 'privateSectionBoundary',
      data: { sectionId: 'one', edge: 'start' },
    },
    { id: 'p1', type: 'paragraph', data: { text: 'Inside one' } },
    {
      id: 'e1',
      type: 'privateSectionBoundary',
      data: { sectionId: 'one', edge: 'end' },
    },
    { id: 'p2', type: 'paragraph', data: { text: 'Between' } },
    {
      id: 's2',
      type: 'privateSectionBoundary',
      data: { sectionId: 'two', edge: 'start' },
    },
    { id: 'p3', type: 'paragraph', data: { text: 'Inside two' } },
    {
      id: 'e2',
      type: 'privateSectionBoundary',
      data: { sectionId: 'two', edge: 'end' },
    },
    {
      id: 'media',
      type: 'contentMedia',
      data: {
        asset: {
          assetUuid: 'fixture',
          type: AssetType.Image,
          extension: 'svg',
          size: 1,
          media: {
            kind: 'image',
            src: '/slow-image.svg',
            previewSrc: '/slow-image.svg',
          },
        },
        layout: 'centered',
      },
    },
    {
      id: 'gallery',
      type: 'contentGallery',
      data: {
        items: ['first', 'second'].map((id) => ({
          id,
          caption: id,
          asset: {
            assetUuid: id,
            extension: 'svg',
            media: {
              kind: 'image',
              src: '/slow-image.svg',
              previewSrc: '/slow-image.svg',
            },
          },
        })),
      },
    },
    // New blocks go last: the move buttons and other tests count from the top.
    { id: 'divider', type: 'delimiter', data: {} },
    {
      id: 'quote',
      type: 'quote',
      data: { text: 'Quoted', caption: 'Someone', alignment: 'left' },
    },
    { id: 'p4', type: 'paragraph', data: { text: 'After' } },
  ],
};
onMounted(async () => {
  const [Editor, Quote] = await Promise.all([
    import('@editorjs/editorjs').then((module) => module.default),
    import('@editorjs/quote').then((module) => module.default),
  ]);
  editor = new Editor({
    holder: holder.value!,
    data: initial as any,
    tools: {
      privateSectionBoundary: PrivateSectionBoundaryTool as any,
      contentMedia: {
        class: ContentMediaTool as any,
        inlineToolbar: true,
        config: mediaToolConfig,
      },
      contentGallery: {
        class: ContentGalleryTool as any,
        inlineToolbar: true,
        config: mediaToolConfig,
      },
      contentAudio: {
        class: ContentAudioTool as any,
        inlineToolbar: true,
        config: audioToolConfig,
      },
      contentAttachment: {
        class: ContentAttachmentTool as any,
        inlineToolbar: true,
        config: anyFileToolConfig,
      },
      contentFileGroup: {
        class: ContentFileGroupTool as any,
        inlineToolbar: true,
        config: anyFileToolConfig,
      },
      delimiter: ContentDelimiterTool as any,
      quote: { class: Quote as any, inlineToolbar: true },
    },
    onChange: (_api, event) => {
      events.value++;
      if (!ready.value || snapshots.isApplying.value) return;
      if (sections.handleChange(event)) snapshots.recordChange();
    },
  });
  await editor.isReady;
  unbindGutterClick = bindEditorGutterClick(holder.value!, editor);
  unbindCurrentBlock = bindEditorCurrentBlock(holder.value!, editor, {
    textBlocks: new Set(['paragraph', 'quote']),
  });
  const site = useInternalUrlSite();
  unbindLinkPaste = bindEditorLinkPaste(holder.value!, editor, {
    site,
    linkBlocks: new Set(['paragraph']),
    findEntity: (url) => findEntityByInternalUrl(url, site),
  });
  unbindFilePaste = bindEditorFilePaste(holder.value!, editor, {
    onSkipped: (skipped) =>
      uploadErrors.value.push(...skipped.map(({ name }) => name)),
  });
  unbindPlainFields = bindEditorPlainFields(holder.value!, editor);
  sections = createEditorPrivateSections(editor, { suppressionDuration: 20 });
  cleanupPrivatePattern = createEditorPrivatePattern(holder.value!);
  snapshots = createEditorHistorySession({
    read: () => readCleanEditorOutput(editor),
    render: async (data) => {
      sections.resetSuppression();
      try {
        await editor.render(data as any);
      } finally {
        sections.resetSuppression();
      }
      sections.refresh();
    },
    onCurrentChange: (state) => {
      currentKey.value = state.key;
    },
    history: {
      field: { ownerType: 'page', ownerRef: 'fixture', slot: 'page-body' },
      transport,
    },
  });
  await snapshots.initialize();
  savedKey.value = currentKey.value;
  transitions.value = [];
  ready.value = true;
});
async function save() {
  await snapshots.synchronize();
  savedKey.value = currentKey.value;
  transitions.value = [];
}
async function restore() {
  await snapshots.restore(initial);
}
function insert() {
  editor.blocks.insert('privateSectionBoundary', {
    sectionId: 'new',
    edge: 'start',
    createPair: true,
  });
}
function remove() {
  const index = Array.from(
    { length: editor.blocks.getBlocksCount() },
    (_, i) => i,
  ).find((i) =>
    editor.blocks
      .getBlockByIndex(i)
      ?.holder.querySelector('[data-private-section-id="new"]'),
  );
  if (index !== undefined) editor.blocks.delete(index);
}
/**
 * A file block the way the toolbox adds one: a placeholder whose fields
 * Editor.js reads straight away, which becomes what the picker answers.
 */
function insertFile() {
  const block = editor.blocks.insert(
    'contentAttachment',
    { autoOpen: true },
    undefined,
    editor.blocks.getBlocksCount(),
    true,
  );
  // What the toolbox's handler of a new block does.
  void block.focusable;
}
function choosePicture() {
  picking.value = false;
  answerPick?.(picture('chosen'));
  answerPick = undefined;
}
onBeforeUnmount(() => {
  ready.value = false;
  unbindGutterClick?.();
  unbindCurrentBlock?.();
  unbindLinkPaste?.();
  unbindFilePaste?.();
  unbindPlainFields?.();
  cleanupPrivatePattern?.();
  sections?.destroy();
  snapshots?.destroy();
  editor?.destroy();
});
</script>

<template>
  <main class="m-auto w-(--width-wide) p-md">
    <div
      class="sticky top-0 z-10 flex flex-wrap gap-xs bg-bg-1 p-xs"
      :data-ready="ready"
      :data-events="events"
      :data-transitions="transitions.join(',')"
      :data-snapshot-pending="snapshotPending"
      :data-history-writes="historyWrites.join(',')"
      :data-upload-errors="uploadErrors.join(',')"
      :data-pending-uploads="pendingUploads"
    >
      <button data-save @click="save">{{ dirty ? 'Save' : 'Saved' }}</button>
      <button @click="insert">Insert section</button>
      <button @click="remove">Delete section</button>
      <button @click="sections.refresh()">Refresh decoration</button>
      <button @click="editor.blocks.move(6, 1)">Invalid move</button>
      <button @click="editor.blocks.move(2, 4)">Valid move</button>
      <button @click="restore">Restore</button>
      <button @click="insertFile">Insert file</button>
      <button :disabled="!picking" @click="choosePicture">
        Choose picture
      </button>
    </div>
    <div ref="holder" class="content-editor relative" />
  </main>
</template>
