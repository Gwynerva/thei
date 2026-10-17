<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import { getAssetMediaKind } from '#layers/thei/shared/assets/formats';
import {
  assetPreview,
  PREVIEW_ARCHIVE_ROWS,
  PREVIEW_ENTRY_BYTES,
} from '#layers/thei/shared/assets/preview';
import {
  isZipEntryReadable,
  zipEntryBaseName,
  zipTree,
  type ByteSource,
  type ZipDirectory,
  type ZipEntry,
  type ZipFolder,
} from '#layers/thei/shared/zip-directory';
import {
  readZipEntry,
  type ArchiveFile,
} from '#layers/thei/app/composables/file-preview/zip';
import { titlePopup } from '#layers/thei/app/composables/title-popup-content';

/**
 * An archive as a file explorer shows a disk: one folder at a time, its
 * folders first, each with how many files it holds and what they weigh,
 * then its files. The path above leads back up; when it no longer fits, it
 * folds into the folder it ends at, which opens the whole way up. A file
 * that can be shown is unpacked by the browser from its own bytes alone and
 * handed on to be opened as any file is.
 */
const props = defineProps<{ directory: ZipDirectory; source: ByteSource }>();
const emit = defineEmits<{ open: [file: ArchiveFile] }>();

const humanSize = useHumanSize();
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const root = computed(() => zipTree(props.directory.entries, collator.compare));
const folder = shallowRef<ZipFolder>(root.value);
watch(root, (next) => (folder.value = next));

/** The folders from the archive down to the one open; the top is «Archive». */
const chain = computed(() => {
  const levels: ZipFolder[] = [];
  for (let at: ZipFolder | undefined = folder.value; at; at = at.parent)
    levels.unshift(at);
  return levels;
});
const levelName = (level: ZipFolder) =>
  level.parent ? level.name : phrase.value.archive_root;

const packed = computed(() =>
  props.directory.entries.reduce((sum, entry) => sum + entry.packedSize, 0),
);

/** The folder's folders and files, as many as are listed at once. */
const rows = computed(() => {
  const { folders, files } = folder.value;
  const shown = folders.slice(0, PREVIEW_ARCHIVE_ROWS);
  return {
    folders: shown,
    files: files.slice(0, Math.max(0, PREVIEW_ARCHIVE_ROWS - shown.length)),
    more: Math.max(0, folders.length + files.length - PREVIEW_ARCHIVE_ROWS),
  };
});

function go(next: ZipFolder) {
  folder.value = next;
  levelsOpen.value = false;
}

function iconOf(entry: ZipEntry): IconName {
  const extension = getPathExtension(entry.name);
  const media = getAssetMediaKind(extension);
  if (media === 'image' || media === 'video') return 'media';
  if (media === 'audio') return 'audio';
  const kind = assetPreview(extension)?.kind;
  if (kind === 'zip') return 'files';
  return kind && kind !== 'probe' ? 'text' : 'file';
}

/** Why a file of the archive does not open, or nothing when it does. */
function closedReason(entry: ZipEntry): string | undefined {
  if (entry.encrypted) return phrase.value.archive_entry_locked;
  if (assetPreview(getPathExtension(entry.name))?.kind === 'zip')
    return phrase.value.archive_entry_nested;
  if (entry.size > PREVIEW_ENTRY_BYTES)
    return phrase.value.archive_entry_too_large(humanSize(PREVIEW_ENTRY_BYTES));
  if (!isZipEntryReadable(entry, PREVIEW_ENTRY_BYTES))
    return phrase.value.archive_entry_unavailable;
  return undefined;
}

function hintOf(entry: ZipEntry) {
  const reason =
    closedReason(entry) ??
    (failed.value === entry && phrase.value.file_preview_failed);
  return {
    ...titlePopup(
      zipEntryBaseName(entry.name),
      reason && { text: reason, italic: true },
    ),
    // Only a name cut short needs saying again.
    ...(reason ? {} : { 'data-title-popup-clipped': '' }),
  };
}

const opening = shallowRef<ZipEntry>();
const failed = shallowRef<ZipEntry>();
let controller: AbortController | undefined;

async function open(entry: ZipEntry) {
  if (closedReason(entry)) return;
  controller?.abort();
  const mine = (controller = new AbortController());
  opening.value = entry;
  failed.value = undefined;
  try {
    const bytes = await readZipEntry(props.source, entry, PREVIEW_ENTRY_BYTES, {
      signal: mine.signal,
    });
    if (mine.signal.aborted) return;
    emit('open', {
      name: entry.name,
      extension: getPathExtension(entry.name),
      file: new Blob([bytes]),
    });
  } catch {
    if (!mine.signal.aborted) failed.value = entry;
  } finally {
    if (opening.value === entry) opening.value = undefined;
  }
}

function onListKeydown(event: KeyboardEvent) {
  // Up a level, as in a file explorer.
  if (event.key === 'Backspace' && folder.value.parent) {
    event.preventDefault();
    go(folder.value.parent);
  }
}

// The whole path is laid out unseen: when it is wider than its room, it
// folds into the folder it ends at.
const pathBox = useTemplateRef<HTMLElement>('pathBox');
const pathMeasure = useTemplateRef<HTMLElement>('pathMeasure');
const levelsButton = useTemplateRef<HTMLElement>('levelsButton');
const collapsed = ref(false);
const levelsOpen = ref(false);

function measure() {
  const box = pathBox.value;
  const whole = pathMeasure.value;
  if (!box || !whole) return;
  collapsed.value =
    chain.value.length > 1 && whole.scrollWidth > box.clientWidth;
}

let resizes: ResizeObserver | undefined;
onMounted(() => {
  resizes = new ResizeObserver(measure);
  if (pathBox.value) resizes.observe(pathBox.value);
  measure();
});
watch(chain, () => nextTick(measure));
onBeforeUnmount(() => {
  resizes?.disconnect();
  controller?.abort();
});
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-normal border
      border-border-1 bg-bg-document"
    data-file-preview-zip
  >
    <div
      class="flex min-h-11 shrink-0 items-center gap-sm border-b border-border-1
        px-xs"
    >
      <div ref="pathBox" class="relative flex min-w-0 flex-1 items-center">
        <div
          ref="pathMeasure"
          class="invisible absolute top-0 left-0 flex items-center text-xs
            whitespace-nowrap"
          aria-hidden="true"
        >
          <template v-for="(level, index) in chain" :key="level.path">
            <Icon v-if="index" name="chevron-right" class="shrink-0" />
            <span class="px-1.5 py-1">{{ levelName(level) }}</span>
          </template>
        </div>
        <nav
          v-if="!collapsed"
          class="flex min-w-0 items-center text-xs"
          :aria-label="phrase.archive_levels"
          data-archive-path
        >
          <template v-for="(level, index) in chain" :key="level.path">
            <Icon
              v-if="index"
              name="chevron-right"
              class="shrink-0 text-text-3"
            />
            <span
              v-if="level === folder"
              class="truncate px-1.5 py-1 font-semibold text-text-1"
              aria-current="location"
              >{{ levelName(level) }}</span
            >
            <button
              v-else
              type="button"
              class="shrink-0 cursor-pointer rounded-sm px-1.5 py-1 text-text-2
                transition hocus:bg-accent/10 hocus:text-text-1"
              @click="go(level)"
            >
              {{ levelName(level) }}
            </button>
          </template>
        </nav>
        <button
          v-else
          ref="levelsButton"
          type="button"
          class="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm
            px-1.5 py-1 text-xs font-semibold text-text-1 transition
            hocus:bg-accent/10"
          :aria-label="`${phrase.archive_levels}: ${levelName(folder)}`"
          :aria-expanded="levelsOpen"
          data-archive-levels
          @click="levelsOpen = !levelsOpen"
        >
          <Icon name="folder" class="shrink-0 text-accent" />
          <span class="truncate">{{ levelName(folder) }}</span>
          <Icon
            name="chevron-right"
            class="shrink-0 text-text-3 transition"
            :class="levelsOpen ? '-rotate-90' : 'rotate-90'"
          />
        </button>
      </div>
      <span
        class="shrink-0 pr-xs text-xs text-text-3 tabular-nums"
        :data-title-popup="
          folder.parent ? undefined : phrase.archive_packed(humanSize(packed))
        "
      >
        {{ phrase.archive_summary(folder.count, humanSize(folder.size)) }}
      </span>
    </div>

    <FloatingPopup
      v-model:open="levelsOpen"
      :anchor="levelsButton"
      placement="bottom-start"
      :fallback-placements="['top-start']"
      density="compact"
      fit-content
    >
      <!-- As small as the path it unfolds: a deep archive keeps it short. -->
      <div class="flex max-w-72 flex-col" data-archive-levels-popup>
        <button
          v-for="(level, index) in chain"
          :key="level.path"
          type="button"
          class="flex min-h-7 w-full cursor-pointer items-center gap-1
            rounded-sm py-0.5 pr-1.5 text-left text-xs transition
            pointer-coarse:min-h-8 hocus:bg-bg-3"
          :style="{
            // Each level a little further in, its arrow under the one above.
            paddingLeft: `calc(var(--spacing) * (1.5 + ${Math.max(0, index - 1)} * 2))`,
          }"
          :aria-current="level === folder ? 'location' : undefined"
          @click="go(level)"
        >
          <Icon
            v-if="index"
            name="subfolder-arrow"
            class="size-3 shrink-0 text-text-3"
          />
          <Icon
            name="folder"
            class="shrink-0"
            :class="level === folder ? 'text-accent' : 'text-text-3'"
          />
          <span
            class="min-w-0 truncate"
            :class="level === folder && 'font-semibold text-accent'"
            >{{ levelName(level) }}</span
          >
        </button>
      </div>
    </FloatingPopup>

    <div
      class="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-sm border-b
        border-border-1 px-sm py-1 text-2xs font-semibold tracking-wide
        text-text-3 uppercase"
      aria-hidden="true"
    >
      <span>{{ phrase.archive_name }}</span>
      <span>{{ phrase.archive_size }}</span>
    </div>

    <div
      class="scrollbar-hover min-h-0 flex-1 overflow-auto py-1"
      data-own-arrows
      role="list"
      data-archive-list
      @keydown="onListKeydown"
    >
      <div v-for="item in rows.folders" :key="item.path" role="listitem">
        <button
          type="button"
          class="grid min-h-9 w-full cursor-pointer
            grid-cols-[minmax(0,1fr)_auto] items-center gap-sm px-sm text-left
            text-sm text-text-1 transition hocus:bg-accent/10"
          :data-title-popup="item.name"
          data-title-popup-clipped
          :data-archive-folder="item.path"
          @click="go(item)"
        >
          <span class="flex min-w-0 items-center gap-xs">
            <Icon name="folder" class="shrink-0 text-accent" />
            <span class="truncate font-semibold" data-title-popup-clip>{{
              item.name
            }}</span>
          </span>
          <span
            class="flex shrink-0 items-center gap-sm text-xs text-text-3
              tabular-nums"
          >
            <span class="flex items-center gap-0.5">
              <Icon name="file" />
              {{ item.count }}
              <span class="sr-only">{{
                phrase.archive_files(item.count)
              }}</span>
            </span>
            <span>{{ humanSize(item.size) }}</span>
          </span>
        </button>
      </div>
      <div v-for="entry in rows.files" :key="entry.name" role="listitem">
        <button
          type="button"
          class="grid min-h-9 w-full grid-cols-[minmax(0,1fr)_auto] items-center
            gap-sm px-sm text-left text-sm transition"
          :class="
            closedReason(entry)
              ? 'cursor-default text-text-2'
              : 'cursor-pointer text-text-1 hocus:bg-accent/10'
          "
          :aria-disabled="closedReason(entry) ? true : undefined"
          :aria-busy="opening === entry || undefined"
          v-bind="hintOf(entry)"
          :data-archive-entry="entry.name"
          @click="open(entry)"
        >
          <span class="flex min-w-0 items-center gap-xs">
            <Icon :name="iconOf(entry)" class="shrink-0 text-text-3" />
            <span class="truncate" data-title-popup-clip>{{
              zipEntryBaseName(entry.name)
            }}</span>
            <Icon
              v-if="entry.encrypted"
              name="lock-close"
              class="shrink-0 text-text-3"
            />
          </span>
          <span
            class="flex shrink-0 items-center gap-xs text-xs text-text-3
              tabular-nums"
          >
            <Icon v-if="opening === entry" name="loading" />
            <Icon
              v-else-if="failed === entry"
              name="warning"
              class="text-text-error"
            />
            {{ humanSize(entry.size) }}
          </span>
        </button>
      </div>
      <p v-if="rows.more" class="px-sm py-xs text-xs text-text-3">
        {{ phrase.archive_more(rows.more) }}
      </p>
      <p
        v-if="directory.count > directory.entries.length && !folder.parent"
        class="px-sm py-xs text-xs text-text-3"
      >
        {{ phrase.archive_partial }}
      </p>
    </div>
  </div>
</template>
