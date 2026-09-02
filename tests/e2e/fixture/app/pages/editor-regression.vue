<script setup lang="ts">
import type EditorJS from '@editorjs/editorjs';
import {
  PrivateSectionBoundaryTool,
  ContentMediaTool,
  ContentGalleryTool,
} from '#layers/thei/app/components/content/editor-tools';
import { createEditorPrivateSections } from '#layers/thei/app/composables/editor-private-sections';
import {
  createEditorSnapshotManager,
  readCleanEditorOutput,
} from '#layers/thei/app/composables/editor-snapshots';
import {
  contentSemanticKey,
  type ContentOutputData,
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
let sections: ReturnType<typeof createEditorPrivateSections>;
let snapshots: ReturnType<typeof createEditorSnapshotManager>;
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
          extension: 'svg',
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
  ],
};
onMounted(async () => {
  const Editor = (await import('@editorjs/editorjs')).default;
  editor = new Editor({
    holder: holder.value!,
    data: initial as any,
    tools: {
      privateSectionBoundary: PrivateSectionBoundaryTool as any,
      contentMedia: ContentMediaTool as any,
      contentGallery: ContentGalleryTool as any,
    },
    onChange: (_api, event) => {
      events.value++;
      if (!ready.value || snapshots.isApplying.value) return;
      if (sections.handleChange(event)) snapshots.recordChange();
    },
  });
  await editor.isReady;
  sections = createEditorPrivateSections(editor);
  snapshots = createEditorSnapshotManager({
    storageKey: 'fixture',
    storage: sessionStorage,
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
    onCurrentChange: (data) => {
      currentKey.value = contentSemanticKey(data);
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
  await snapshots.restore({ createdAt: Date.now(), data: initial });
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
onBeforeUnmount(() => {
  ready.value = false;
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
    >
      <button data-save @click="save">{{ dirty ? 'Save' : 'Saved' }}</button>
      <button @click="insert">Insert section</button>
      <button @click="remove">Delete section</button>
      <button @click="sections.refresh()">Refresh decoration</button>
      <button @click="editor.blocks.move(6, 1)">Invalid move</button>
      <button @click="editor.blocks.move(2, 4)">Valid move</button>
      <button @click="restore">Restore</button>
    </div>
    <div ref="holder" class="content-editor" />
  </main>
</template>
