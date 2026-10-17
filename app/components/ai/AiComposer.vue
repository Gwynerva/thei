<script lang="ts" setup>
import type { ReferenceElement } from '@floating-ui/vue';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import type { ContentLinkPick } from '#layers/thei/app/components/content/link-picker/types';
import { typedLines } from '#layers/thei/shared/ai-message-text';
import ContentInlineLinkDecorator from '#layers/thei/app/components/content/ContentInlineLinkDecorator.vue';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { libraryAssetDetailsModal } from '#layers/thei/app/modals/asset-library/details-modal';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import { getAssetMediaKind } from '#layers/thei/shared/assets/formats';
import type {
  AiComposerExpose,
  AiComposerFile,
  AiMentionItem,
} from '#layers/thei/app/composables/ai-session';
import { runEditCommand } from '#layers/thei/app/components/content/editor-edit-commands';
import { typedAt } from '#layers/thei/app/composables/at-trigger';
import { rangeAnchor } from '#layers/thei/app/composables/popup-placement';

/**
 * Where the owner writes in a session: one row — attach, the words, send —
 * whose words grow upward as they come, up to a height of their own. `@`
 * looks for an entry, a project, an event, as a link in the editor does, and
 * puts it in as a chip, removed whole. Enter sends, Shift+Enter breaks the
 * line — on a touch screen Enter breaks it and the button sends. While the
 * model answers, a button of its own stops it, whatever is typed: what is
 * sent meanwhile the model takes in. What is sent is
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
    /** The ready-made request the words began from. */
    templateId: string | undefined,
  ];
  stop: [];
}>();

const field = ref<HTMLDivElement>();
const empty = ref(true);
const picking = ref(false);
/** Each mention gets a picker of its own, fresh. */
const pickOpening = ref(0);
const picker = ref<{ focus: () => void }>();
const pickAnchor = shallowRef<ReferenceElement | null>(null);
const menuOpen = ref(false);
const menuButton = ref<HTMLElement>();
/** Where the `@` was typed, to put the chip in its place. */
let mentionRange: Range | null = null;

const MENTION_CLASS = 'ai-mention';

/** The ready-made request the words began from, while words are there. */
const template = ref<string>();

function updateEmpty() {
  const element = field.value;
  empty.value =
    !element ||
    (!element.textContent?.trim() &&
      !element.querySelector(`.${MENTION_CLASS}`));
  if (!element?.textContent?.trim()) template.value = undefined;
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

/**
 * A file's hint: its name, which a picture hides and a narrow chip may cut,
 * and why it failed. A name shown whole needs no hint.
 */
function broughtHint(item: Brought) {
  return {
    ...titlePopup(
      item.failed ? { text: item.name, bold: true } : item.name,
      TITLE_POPUP_GAP,
      item.failed,
    ),
    'data-title-popup-clipped':
      item.picture || item.failed ? undefined : ('' as const),
  };
}

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
  const began = template.value;
  clear();
  // Every picture's copy in the browser goes: a file that did not upload
  // stays out of the message, and one sent is the library's now.
  for (const item of kept) {
    forget(item);
    item.picture = undefined;
  }
  brought.value = [];
  emit(
    'send',
    text,
    about,
    files,
    () => {
      // Back only into an empty field: nothing written since is lost.
      if (!field.value || !empty.value || brought.value.length) return;
      field.value.innerHTML = written;
      brought.value = kept.filter((item) => item.asset);
      updateEmpty();
      template.value = began;
    },
    began,
  );
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

function input(event: Event) {
  updateEmpty();
  // An `@` just typed where it stands alone, as the editor's text takes one
  // (`typedAt`): the same rule in both places.
  const at = field.value && typedAt(event, field.value);
  if (!at) return;
  // The chip goes where the caret is, right after it; the picker points at
  // it. Its context is the field: in a popup, the picker is that popup's own.
  mentionRange = document.createRange();
  mentionRange.setStart(at.endContainer, at.endOffset);
  mentionRange.collapse(true);
  pickAnchor.value = rangeAnchor(at, field.value!);
  pickOpening.value++;
  picking.value = true;
}

// ---- Mentions --------------------------------------------------------------------

/**
 * A mention: the archive's own link to an entity, drawn and resolved as in
 * any text, whole and not editable. What is sent names it by `target` — with
 * `#` and an anchor for a heading inside it, which the model reads as a link
 * to that place.
 */
function mentionNode(item: AiMentionItem, place?: MentionPlace) {
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
  chip.dataset.target = place?.fragment
    ? `${target}#${place.fragment}`
    : target;
  if (place?.fragment) chip.dataset.entityFragment = place.fragment;
  chip.dataset.ref = target.replace('/', ':');
  // A diary entry by its day, as the picker named it; a place by its path.
  chip.textContent = place?.path.length
    ? [...place.path, ...(place.heading ? [place.heading] : [])]
        .map((part) => publicText(part))
        .join(' › ')
    : item.date
      ? entityDisplayTitle(item)
      : publicText(item.title);
  return chip;
}

/** Where inside it a mention leads, and the path down to it. */
type MentionPlace = { fragment?: string; heading?: string; path: string[] };

/** The picker's pick, as a chip: an entity, or a place inside it. */
function mentionPicked(pick: ContentLinkPick) {
  if (pick.kind !== 'entity') return;
  choose(pick.entity, {
    fragment: pick.fragment,
    heading: pick.heading,
    path: pick.path,
  });
}

function choose(item: AiMentionItem, place?: MentionPlace) {
  picking.value = false;
  const element = field.value;
  if (!element) return;
  element.focus();
  const chip = mentionNode(item, place);
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

/** The caret at the end of the words, in the field. */
function caretAtEnd(element: HTMLElement) {
  element.focus();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** The words a ready-made request put in last, while they stand as put. */
let prefilled: string | undefined;
/** What that request put in at the end of the field, to take it out again. */
let prefilledTail = '';

/**
 * Takes `tail` off the end of the field's words, where a request put it,
 * and says whether the words ended so; the owner's own words before it and
 * the chips among them stay where they are.
 */
function takeOffTail(element: HTMLElement, tail: string): boolean {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(`.${MENTION_CLASS}`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  const joined = texts.map((node) => node.data).join('');
  if (!tail || !joined.endsWith(tail)) return false;
  let rest = tail.length;
  for (const node of texts.reverse()) {
    if (!rest) break;
    const take = Math.min(node.data.length, rest);
    node.data = node.data.slice(0, node.data.length - take);
    rest -= take;
  }
  return true;
}

/**
 * Words put in for the owner to go on with — a ready-made request's: into
 * an empty field as they are, after what is there on a line of their own,
 * or in place of another request's words the owner has not touched. Typed
 * in as one edit, so Ctrl+Z takes them back.
 */
function prefill(text: string, templateId?: string) {
  const element = field.value;
  if (!element || !text) return;
  const isChip = (node: Node) =>
    node instanceof HTMLElement && node.classList.contains(MENTION_CLASS);
  const wordNodes = () =>
    [...element.childNodes].filter((node) => !isChip(node));
  const words = () =>
    wordNodes()
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
  // Another request's words, as they were put in: this one takes their
  // place, and the owner's own words before them stay.
  if (
    prefilled !== undefined &&
    words() === prefilled.trim() &&
    !takeOffTail(element, prefilledTail)
  )
    for (const node of wordNodes()) node.remove();
  caretAtEnd(element);
  // After words, on a line of their own; after chips alone, beside them.
  const typed = words() ? `\n\n${text}` : text;
  if (!runEditCommand('insertText', typed))
    element.append(document.createTextNode(typed));
  prefilled = words();
  prefilledTail = typed;
  updateEmpty();
  if (templateId) template.value = templateId;
}

/** A chip for an entity at the end of the words: what they are about. */
function mention(item: AiMentionItem) {
  const element = field.value;
  if (!element) return;
  mentionRange = null;
  caretAtEnd(element);
  choose(item);
}

defineExpose<AiComposerExpose>({
  focus: () => field.value?.focus(),
  prefill,
  mention,
  templateId: () => template.value,
});
</script>

<template>
  <div
    class="relative mx-auto w-full max-w-184 rounded-normal border bg-bg-2 p-1
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
        v-bind="broughtHint(item)"
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
              <span
                class="truncate text-xs font-semibold"
                data-title-popup-clip
                >{{ item.name }}</span
              >
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
      <span class="inline-flex">
        <button
          ref="menuButton"
          type="button"
          class="flex size-9 shrink-0 cursor-pointer items-center justify-center
            bg-transparent text-xl text-accent transition-opacity
            disabled:cursor-default disabled:text-text-3 disabled:opacity-100
            pointer-coarse:size-11 popup-open:opacity-75 hocus:opacity-75"
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
      <AiStopButton
        v-if="running"
        class="text-xl"
        data-composer-stop
        @click="emit('stop')"
      />
      <button
        type="button"
        class="flex size-9 shrink-0 cursor-pointer items-center justify-center
          bg-transparent text-xl text-accent transition-opacity
          disabled:cursor-default disabled:text-text-3 disabled:opacity-100
          pointer-coarse:size-11 hocus:opacity-75"
        :disabled="disabled || busy || !sendable"
        :aria-label="phrase.ai_send"
        :data-title-popup="phrase.ai_send"
        data-composer-send
        @click="send"
      >
        <Icon :name="busy || uploading ? 'loading' : 'send'" />
      </button>
    </div>

    <FloatingPopup
      v-model:open="menuOpen"
      :anchor="menuButton ?? null"
      placement="top-start"
      max-width="20rem"
      density="list"
    >
      <div role="menu" class="flex flex-col gap-0.5">
        <button
          type="button"
          role="menuitem"
          class="grid popup-item grid-cols-[auto_1fr] items-center gap-y-0"
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
          class="grid popup-item grid-cols-[auto_1fr] items-center gap-y-0"
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
        justify-center rounded-normal bg-bg-accent/90 text-sm font-semibold
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
      v-model:open="picking"
      :anchor="pickAnchor"
      placement="top-start"
      max-width="22rem"
      complex
      @opened="picker?.focus()"
      @dismiss="pickerDismissed"
    >
      <!-- A picker of its own for each mention, fresh. -->
      <ContentLinkPicker
        :key="pickOpening"
        ref="picker"
        mode="mention"
        @apply="mentionPicked"
      />
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
