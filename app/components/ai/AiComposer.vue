<script lang="ts" setup>
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import { typedLines } from '#layers/thei/shared/ai-message-text';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { libraryAssetDetailsModal } from '#layers/thei/app/modals/asset-library/details-modal';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import { getAssetMediaKind } from '#layers/thei/shared/assets/formats';
import type { AiComposerFile } from '#layers/thei/app/composables/ai-session';

/**
 * Where the owner writes in a session: one row — attach, the words, send —
 * whose words grow upward as they come, up to a height of their own. `@`
 * looks for an entry, a project, an event, as a link in the editor does, and
 * puts it in as a chip, removed whole. Enter sends, Shift+Enter breaks the
 * line — on a touch screen Enter breaks it and the button sends; while the
 * model answers, the button stops it. What is sent is
 * editing Markdown: the chips become links to what they name.
 *
 * Files come along from the «+» menu, pasted — several at once — or dropped
 * on it. Each goes into the library as it is, the moment it is brought, and
 * waits above the words; the message is sent once they are all up. What the
 * session does with them is the server's: their place in it is given there.
 */
const props = defineProps<{
  running?: boolean;
  disabled?: boolean;
  placeholder: string;
  busy?: boolean;
}>();
const emit = defineEmits<{
  /** `restore` puts the words and files back, when they could not be sent. */
  send: [
    text: string,
    about: string[],
    files: AiComposerFile[],
    restore: () => void,
  ];
  stop: [];
}>();

const field = ref<HTMLDivElement>();
const empty = ref(true);
const picking = ref(false);
const picker = ref<{ focus: () => void }>();
const pickAnchor = shallowRef<{ getBoundingClientRect: () => DOMRect } | null>(
  null,
);
const menuOpen = ref(false);
const menuButton = ref<HTMLElement>();
/** Where the `@` was typed, to put the chip in its place. */
let mentionRange: Range | null = null;

const MENTION_CLASS = 'ai-mention';

function updateEmpty() {
  const element = field.value;
  empty.value =
    !element ||
    (!element.textContent?.trim() &&
      !element.querySelector(`.${MENTION_CLASS}`));
}

/** The words as editing Markdown, and the entities they name. */
function serialize(): { text: string; about: string[] } {
  const about: string[] = [];
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.classList.contains(MENTION_CLASS)) {
      const ref = node.dataset.ref ?? '';
      const target = node.dataset.target ?? '';
      if (ref) about.push(ref);
      const title = (node.textContent ?? '').replace(/[[\]]/g, '');
      return `[${title}](thei:${target})`;
    }
    if (node.tagName === 'BR') return '\n';
    const inner = [...node.childNodes].map(walk).join('');
    return node.tagName === 'DIV' || node.tagName === 'P'
      ? `\n${inner}`
      : inner;
  };
  const text = typedLines(
    [...(field.value?.childNodes ?? [])]
      .map(walk)
      .join('')
      .replace(/\u00a0/g, ' '),
  );
  return { text, about: [...new Set(about)] };
}

const linkResolver = useContentLinkResolver('admin');

/** A mention is not followed from here: the field is for writing. */
function clickInField(event: MouseEvent) {
  if ((event.target as Element | null)?.closest('a[data-content-link]'))
    event.preventDefault();
}

function clear() {
  if (field.value) field.value.innerHTML = '';
  updateEmpty();
}

// ---- Files -------------------------------------------------------------------

/** The most files one message brings, as the server takes them. */
const FILES_MAX = 10;

interface Brought {
  key: string;
  name: string;
  extension: string;
  /** A picture's own pixels, shown before the library has it. */
  picture?: string;
  /** How much of it has left the browser, 0..1. */
  share: number;
  asset?: AssetVariantInfo;
  failed?: string;
  controller: AbortController;
}

const brought = ref<Brought[]>([]);
const uploading = computed(() =>
  brought.value.some((item) => !item.asset && !item.failed),
);
const ready = computed(() => brought.value.filter((item) => item.asset));
const filePicker = useTemplateRef<HTMLInputElement>('filePicker');

function bring(files: Iterable<File>) {
  if (props.disabled) return;
  for (const file of files) {
    if (brought.value.length >= FILES_MAX) {
      showToast(phrase.value.ai_composer_files_limit(FILES_MAX));
      return;
    }
    const extension = getPathExtension(file.name);
    if (!extension) {
      showToast(phrase.value.ai_composer_file_unnamed);
      continue;
    }
    const item = reactive<Brought>({
      key: crypto.randomUUID(),
      name: file.name,
      extension,
      picture:
        getAssetMediaKind(extension) === 'image'
          ? URL.createObjectURL(file)
          : undefined,
      share: 0,
      controller: new AbortController(),
    });
    brought.value.push(item);
    uploadOriginalFile(
      file,
      extension,
      {},
      {
        signal: item.controller.signal,
        onProgress: (share) => (item.share = share),
      },
    )
      .then((asset) => (item.asset = asset))
      .catch((caught) => {
        if (!item.controller.signal.aborted)
          item.failed = errorMessage(
            caught,
            phrase.value.ai_composer_file_failed,
          );
      });
  }
}

function forget(item: Brought) {
  if (item.picture) URL.revokeObjectURL(item.picture);
}

function unbring(item: Brought) {
  item.controller.abort();
  forget(item);
  brought.value = brought.value.filter((one) => one.key !== item.key);
}

function pickFiles() {
  menuOpen.value = false;
  filePicker.value?.click();
}

function picked(event: Event) {
  const input = event.target as HTMLInputElement;
  bring([...(input.files ?? [])]);
  input.value = '';
}

/** Files dragged over the box: it says it takes them. */
const dragging = ref(false);
let dragDepth = 0;
const carriesFiles = (event: DragEvent) =>
  Boolean(event.dataTransfer?.types.includes('Files'));

function dragEnter(event: DragEvent) {
  if (!carriesFiles(event) || props.disabled) return;
  event.preventDefault();
  dragDepth++;
  dragging.value = true;
}
function dragOver(event: DragEvent) {
  if (!carriesFiles(event) || props.disabled) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}
function dragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragging.value = false;
}
function drop(event: DragEvent) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dragging.value = false;
  bring([...(event.dataTransfer?.files ?? [])]);
}

onBeforeUnmount(() => {
  for (const item of brought.value) {
    item.controller.abort();
    forget(item);
  }
});

// ---- Sending -----------------------------------------------------------------

const humanSize = useHumanSize();

/** A file up already opens as the library shows it. */
function openFile(asset: AssetVariantInfo) {
  void openModal(libraryAssetDetailsModal, { asset });
}

/** The button stops the model while there is nothing to send. */
const stopping = computed(
  () => Boolean(props.running) && empty.value && !brought.value.length,
);

/** Words or files to send, and nothing still on its way up. */
const sendable = computed(
  () => (!empty.value || ready.value.length > 0) && !uploading.value,
);

function send() {
  if (props.disabled || props.busy || uploading.value) return;
  const { text, about } = serialize();
  const files = ready.value.map((item) => ({
    assetUuid: item.asset!.assetUuid,
    name: item.name,
  }));
  if (!text && !files.length) return;
  const written = field.value?.innerHTML ?? '';
  const kept = brought.value;
  clear();
  // A file that did not upload stays out of the message, and goes.
  for (const item of kept) if (!item.asset) forget(item);
  brought.value = [];
  emit('send', text, about, files, () => {
    // Back only into an empty field: nothing written since is lost.
    if (!field.value || !empty.value || brought.value.length) return;
    field.value.innerHTML = written;
    brought.value = kept.filter((item) => item.asset);
    updateEmpty();
  });
}

function primary() {
  if (stopping.value) emit('stop');
  else send();
}

// ---- Typing ------------------------------------------------------------------

/** A line break typed in the middle of the words. */
function insertBreak() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement('br');
  range.insertNode(br);
  // A break with nothing after it needs a second one to show the new line;
  // splitting the words may leave an empty text there, which shows nothing.
  let next = br.nextSibling;
  while (next?.nodeType === Node.TEXT_NODE && !next.textContent)
    next = next.nextSibling;
  if (!next) br.after(document.createElement('br'));
  range.setStartAfter(br);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function keydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    // A phone's keyboard has no Shift to hold: its Enter starts a line, and
    // the button sends.
    if (event.shiftKey || matchMedia('(pointer: coarse)').matches)
      insertBreak();
    else send();
  }
}

/** Whether the caret stands just past the space a chip brought along. */
function pastChipSpace(): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!range.collapsed || node.nodeType !== Node.TEXT_NODE) return false;
  let previous = node.previousSibling;
  while (previous?.nodeType === Node.TEXT_NODE && !previous.textContent)
    previous = previous.previousSibling;
  return (
    range.startOffset === 1 &&
    /\s/.test((node as Text).data[0] ?? '') &&
    previous instanceof HTMLElement &&
    previous.classList.contains(MENTION_CLASS)
  );
}

/** Formatting has no place here; pasted text comes in as words alone. */
function beforeinput(event: InputEvent) {
  if (event.inputType.startsWith('format')) event.preventDefault();
  // A paragraph a keyboard asks for without a key event is a line break here.
  else if (event.inputType === 'insertParagraph') {
    event.preventDefault();
    insertBreak();
  }
  // A chip comes with its space: one typed next to it would only double it.
  // A phone's keyboard may bring a word with its space at once.
  else if (
    event.inputType === 'insertText' &&
    event.data?.startsWith(' ') &&
    pastChipSpace()
  ) {
    event.preventDefault();
    const rest = event.data.slice(1);
    if (rest) document.execCommand('insertText', false, rest);
  }
}

/** Files pasted are brought along; words come in as words alone. */
function paste(event: ClipboardEvent) {
  event.preventDefault();
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) {
    bring(files);
    return;
  }
  const text = event.clipboardData?.getData('text/plain') ?? '';
  document.execCommand('insertText', false, text);
}

/**
 * Whether an `@` was just typed where a word starts: the character before
 * the caret, whatever way it came — a key, a phone's keyboard, a paste of
 * one character.
 */
function atTyped(event: Event): Range | undefined {
  const inputType = (event as InputEvent).inputType ?? '';
  if (!inputType.startsWith('insert')) return undefined;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return undefined;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!range.collapsed || node.nodeType !== Node.TEXT_NODE) return undefined;
  const text = (node as Text).data;
  const at = range.startOffset;
  if (text[at - 1] !== '@') return undefined;
  const before = text[at - 2];
  if (before !== undefined && !/\s/.test(before)) return undefined;
  return range.cloneRange();
}

function input(event: Event) {
  updateEmpty();
  const range = atTyped(event);
  if (!range) return;
  mentionRange = range;
  pickAnchor.value = {
    getBoundingClientRect: () =>
      range.getBoundingClientRect().width ||
      range.getBoundingClientRect().height
        ? range.getBoundingClientRect()
        : field.value!.getBoundingClientRect(),
  };
  picking.value = true;
}

// ---- Mentions --------------------------------------------------------------------

/**
 * A mention: the archive's own link to an entity, drawn and resolved as in
 * any text, whole and not editable. What is sent names it by `target`.
 */
function mentionNode(item: ContentEntitySearchItem) {
  const chip = document.createElement('a');
  chip.className = MENTION_CLASS;
  chip.contentEditable = 'false';
  chip.dataset.mention = '';
  chip.dataset.contentLink = 'entity';
  chip.dataset.entityType = item.entityType;
  chip.dataset.entityId = item.entityId;
  const target =
    item.entityType === 'diary-entry' && item.date
      ? `diary-entry/${item.date}`
      : `${item.entityType}/${item.entityId}`;
  chip.dataset.target = target;
  chip.dataset.ref = target.replace('/', ':');
  // A diary entry by its day, as the picker named it.
  chip.textContent = item.date
    ? entityDisplayTitle(item)
    : publicText(item.title);
  return chip;
}

function choose(item: ContentEntitySearchItem) {
  picking.value = false;
  const element = field.value;
  if (!element) return;
  element.focus();
  const chip = mentionNode(item);
  const space = document.createTextNode(' ');
  const selection = window.getSelection();
  if (mentionRange) {
    // The `@` typed goes; the chip stands where it was.
    const range = mentionRange;
    mentionRange = null;
    if (
      range.startOffset > 0 &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      const at = range.startOffset - 1;
      const text = range.startContainer as Text;
      if (text.data[at] === '@') {
        text.deleteData(at, 1);
        range.setStart(text, at);
        range.collapse(true);
      }
    }
    const fragment = document.createDocumentFragment();
    fragment.append(chip, space);
    range.insertNode(fragment);
  } else element.append(chip, space);
  // The caret goes inside the space, so the words typed next join it.
  const range = document.createRange();
  range.setStart(space, 1);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  updateEmpty();
}

function attachFromMenu() {
  menuOpen.value = false;
  mentionRange = null;
  pickAnchor.value = menuButton.value ?? null;
  picking.value = true;
}

/**
 * Closed without a choice: the words stay as typed. Escape goes back to
 * them, the caret where it was or at their end; a click elsewhere goes where
 * it went.
 */
function pickerDismissed(reason: 'outside' | 'escape') {
  const range = mentionRange;
  mentionRange = null;
  const element = field.value;
  if (reason !== 'escape' || !element) return;
  element.focus();
  const caret = range ?? document.createRange();
  if (!range) {
    caret.selectNodeContents(element);
    caret.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
}

defineExpose({ focus: () => field.value?.focus() });
</script>

<template>
  <div
    class="relative mx-auto w-full max-w-184 rounded-[1.4rem] border bg-bg-2 p-1
      shadow-md shadow-shadow-1 transition-colors"
    :class="dragging ? 'border-accent' : 'border-border-2'"
    data-composer
    @dragenter="dragEnter"
    @dragover="dragOver"
    @dragleave="dragLeave"
    @drop="drop"
  >
    <!-- The files brought along, above the words: a picture by itself,
         any other file by its name; each going up shows how far it is. -->
    <ul
      v-if="brought.length"
      class="flex scrollbar-hover gap-1.5 overflow-x-auto px-1.5 pt-1.5 pb-1"
      data-composer-files
    >
      <li
        v-for="item in brought"
        :key="item.key"
        class="relative flex h-14 shrink-0 overflow-hidden rounded-normal border
          bg-bg-3"
        :class="[
          item.failed ? 'border-border-error' : 'border-border-1',
          item.picture ? 'w-14' : 'max-w-52 min-w-32',
        ]"
        :title="item.failed ?? item.name"
        :data-composer-file="
          item.failed ? 'failed' : item.asset ? 'ready' : 'uploading'
        "
      >
        <!-- Up, it opens in the library's window of it. -->
        <button
          type="button"
          class="flex min-w-0 flex-1 text-left"
          :class="item.asset ? 'cursor-pointer' : 'cursor-default'"
          :disabled="!item.asset"
          :aria-label="item.name"
          data-composer-file-open
          @click="item.asset && openFile(item.asset)"
        >
          <img
            v-if="item.picture"
            :src="item.picture"
            alt=""
            class="size-full object-cover"
            :class="{ 'opacity-60': !item.asset }"
          />
          <span
            v-else
            class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-7 pl-2.5"
          >
            <Icon
              :name="item.failed ? 'warning' : 'file'"
              class="shrink-0 text-lg"
              :class="item.failed ? 'text-text-error' : 'text-text-2'"
            />
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-xs font-semibold">{{
                item.name
              }}</span>
              <span
                class="truncate text-2xs"
                :class="item.failed ? 'text-text-error' : 'text-text-3'"
                >{{
                  item.failed
                    ? phrase.ai_composer_file_failed
                    : item.asset
                      ? humanSize(item.asset.size)
                      : item.extension.toUpperCase()
                }}</span
              >
            </span>
          </span>
        </button>
        <span
          v-if="item.picture && item.failed"
          class="absolute inset-0 flex items-center justify-center
            bg-bg-error/80 text-text-error"
          ><Icon name="warning"
        /></span>
        <span
          v-if="!item.asset && !item.failed"
          class="absolute inset-x-0 bottom-0 h-1 bg-bg-1/70"
          role="progressbar"
          :aria-valuenow="Math.round(item.share * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="item.name"
          ><span
            class="block h-full bg-accent transition-[width]"
            :style="{ width: `${Math.max(item.share * 100, 4)}%` }"
          ></span
        ></span>
        <button
          type="button"
          class="absolute top-1 right-1 flex size-5 cursor-pointer items-center
            justify-center rounded-full bg-bg-1/85 text-xs text-text-2
            transition-colors pointer-coarse:size-7 hocus:bg-bg-1
            hocus:text-text-1"
          :aria-label="`${phrase.ai_composer_file_remove}: ${item.name}`"
          :data-title-popup="phrase.ai_composer_file_remove"
          data-composer-file-remove
          @click="unbring(item)"
        >
          <Icon name="close" />
        </button>
      </li>
    </ul>

    <!-- Closed, the words fade; the box stays solid over the page. -->
    <div
      class="flex items-end gap-1 transition-opacity"
      :class="{ 'opacity-50': disabled }"
    >
      <!-- The two controls are icons alone, in the accent: a shape of their
           own would quarrel with the field's rounded one. -->
      <span ref="menuButton" class="inline-flex">
        <button
          type="button"
          class="flex size-9 shrink-0 cursor-pointer items-center justify-center
            bg-transparent text-xl text-accent transition-opacity
            disabled:cursor-default disabled:text-text-3 disabled:opacity-100
            pointer-coarse:size-11 hocus:opacity-75"
          :disabled="disabled"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          :aria-label="phrase.ai_composer_attach"
          :data-title-popup="phrase.ai_composer_attach"
          data-composer-attach
          @click="menuOpen = !menuOpen"
        >
          <Icon name="plus" />
        </button>
      </span>
      <div class="relative min-w-0 flex-1">
        <div
          ref="field"
          :contenteditable="disabled ? 'false' : 'true'"
          role="textbox"
          aria-multiline="true"
          :aria-label="placeholder"
          :aria-disabled="disabled"
          spellcheck="true"
          class="ai-composer-field content-prose scrollbar-hover max-h-40
            min-h-9 overflow-y-auto px-1.5 py-2 text-sm leading-snug
            wrap-anywhere whitespace-pre-wrap text-text-1 outline-none
            [--content-surface:var(--color-bg-2)] pointer-coarse:min-h-11
            pointer-coarse:py-2.5"
          data-composer-field
          @click="clickInField"
          @keydown="keydown"
          @beforeinput="beforeinput"
          @paste="paste"
          @input="input"
        ></div>
        <span
          v-if="empty"
          class="pointer-events-none absolute inset-x-1.5 top-2 truncate text-sm
            leading-snug text-text-3 pointer-coarse:top-2.5"
          aria-hidden="true"
          >{{ placeholder }}</span
        >
      </div>
      <button
        type="button"
        class="flex size-9 shrink-0 cursor-pointer items-center justify-center
          bg-transparent text-xl text-accent transition-opacity
          disabled:cursor-default disabled:text-text-3 disabled:opacity-100
          pointer-coarse:size-11 hocus:opacity-75"
        :disabled="disabled || busy || (!stopping && !sendable)"
        :aria-label="stopping ? phrase.ai_stop : phrase.ai_send"
        :data-title-popup="stopping ? phrase.ai_stop : phrase.ai_send"
        :data-composer-send="stopping ? 'stop' : 'send'"
        @click="primary"
      >
        <Icon
          :name="
            busy || uploading ? 'loading' : stopping ? 'pause-circle' : 'send'
          "
        />
      </button>
    </div>

    <FloatingPopup
      v-if="menuOpen"
      v-model:open="menuOpen"
      :anchor="menuButton ?? null"
      placement="top-start"
      max-width="20rem"
    >
      <div
        role="menu"
        class="flex flex-col rounded-normal border border-border-1 bg-bg-2 p-1
          shadow-md shadow-shadow-1"
      >
        <button
          type="button"
          role="menuitem"
          class="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-2.5
            rounded-md bg-transparent px-2.5 py-2 text-left
            pointer-coarse:min-h-11 hocus:bg-accent/10"
          data-composer-mention
          @click="attachFromMenu"
        >
          <Icon name="search" class="row-span-2 text-text-2" />
          <b class="text-sm font-semibold">{{
            phrase.ai_composer_mention.title
          }}</b>
          <span class="col-start-2 text-xs text-text-3">{{
            phrase.ai_composer_mention.hint
          }}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          class="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-2.5
            rounded-md bg-transparent px-2.5 py-2 text-left
            pointer-coarse:min-h-11 hocus:bg-accent/10"
          data-composer-files-pick
          @click="pickFiles"
        >
          <Icon name="upload" class="row-span-2 text-text-2" />
          <b class="text-sm font-semibold">{{
            phrase.ai_composer_files.title
          }}</b>
          <span class="col-start-2 text-xs text-text-3">{{
            phrase.ai_composer_files.hint
          }}</span>
        </button>
      </div>
    </FloatingPopup>
    <!-- Files dragged over the box: it says it takes them, over all
         the rest. -->
    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 flex items-center
        justify-center rounded-[1.4rem] bg-bg-accent/90 text-sm font-semibold
        text-accent"
      data-composer-drop
    >
      <Icon name="upload" class="mr-1.5" />{{ phrase.ai_composer_drop }}
    </div>

    <input
      ref="filePicker"
      type="file"
      multiple
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      data-composer-file-input
      @change="picked"
    />

    <FloatingPopup
      v-if="picking"
      v-model:open="picking"
      :anchor="pickAnchor as never"
      placement="top-start"
      max-width="22rem"
      @opened="picker?.focus()"
      @dismiss="pickerDismissed"
    >
      <ContentEntitySearchPopup ref="picker" @select="choose" />
    </FloatingPopup>

    <ContentInlineLinkDecorator
      :root="field ?? null"
      :resolver="linkResolver"
    />
  </div>
</template>

<style scoped>
/* A mention is written, not followed: its card opens on hover, as a link's
   in a text does, and a click only puts the caret beside it. */
.ai-composer-field :deep(a[data-content-link]) {
  cursor: default;
}
</style>
