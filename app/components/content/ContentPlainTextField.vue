<script lang="ts" setup>
import { normalizeContentAttachmentPaste } from './content-attachment';
import { flattenToPlainText } from './editor-edit-commands';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    editable?: boolean;
    placeholder?: string;
  }>(),
  {
    modelValue: '',
    editable: false,
    placeholder: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const root = useTemplateRef<HTMLElement>('root');

function sync() {
  if (!root.value) return;
  // Markup that got in goes as one step of Ctrl+Z; the line break a browser
  // leaves in an emptied field is let be until the blur.
  const value = root.value.querySelector(':not(br)')
    ? flattenToPlainText(root.value)
    : (root.value.textContent ?? '');
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function onBeforeInput(event: InputEvent) {
  if (
    event.inputType.startsWith('format') ||
    event.inputType === 'insertLink' ||
    event.inputType === 'insertParagraph' ||
    event.inputType === 'insertLineBreak'
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * Keys that edit or move inside the field, kept from its block. Editor.js
 * counts only `contenteditable="true"` among a block's inputs, so it reads
 * the caret against another field of the block, takes it for the start or
 * the end, and moves to the block before or after — from the middle of a
 * title. Here they do what they do in any field.
 */
const FIELD_KEYS = new Set([
  'Backspace',
  'Delete',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Tab',
]);

function onKeydown(event: KeyboardEvent) {
  if (FIELD_KEYS.has(event.key)) {
    event.stopPropagation();
    return;
  }
  // One line: Enter adds none.
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  const clipboardText = event.clipboardData?.getData('text/plain');
  const text = clipboardText
    ? normalizeContentAttachmentPaste(clipboardText)
    : undefined;
  if (text) document.execCommand('insertText', false, text);
}

function onBlur() {
  if (!root.value) return;
  const value = root.value.textContent ?? '';
  if (root.value.querySelector('*')) root.value.textContent = value;
  if (value !== props.modelValue) emit('update:modelValue', value);
}

onMounted(() => {
  if (root.value) root.value.textContent = props.modelValue;
});

watch(
  () => props.modelValue,
  (value) => {
    if (!root.value || document.activeElement === root.value) return;
    if (root.value.textContent !== value) root.value.textContent = value;
  },
);
</script>

<template>
  <div
    v-if="editable || modelValue"
    ref="root"
    v-bind="$attrs"
    data-drag-ignore
    :contenteditable="editable ? 'plaintext-only' : 'false'"
    :spellcheck="editable"
    :role="editable ? 'textbox' : undefined"
    :aria-label="editable ? placeholder : undefined"
    :aria-multiline="editable ? 'false' : undefined"
    :data-placeholder="placeholder"
    @input="sync"
    @beforeinput="onBeforeInput"
    @keydown="onKeydown"
    @paste="onPaste"
    @blur="onBlur"
  />
</template>
