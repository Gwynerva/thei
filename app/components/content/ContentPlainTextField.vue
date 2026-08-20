<script lang="ts" setup>
import { normalizeContentAttachmentPaste } from './content-attachment';

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
  const value = root.value.textContent ?? '';
  if (root.value.querySelector('*')) replaceWithPlainText(root.value, value);
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

function onKeydown(event: KeyboardEvent) {
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

function replaceWithPlainText(element: HTMLElement, text: string) {
  const selection = window.getSelection();
  const selectionIsInside = Boolean(
    selection?.anchorNode &&
    selection.focusNode &&
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode),
  );
  const anchorOffset = selectionIsInside
    ? textOffset(element, selection!.anchorNode!, selection!.anchorOffset)
    : 0;
  const focusOffset = selectionIsInside
    ? textOffset(element, selection!.focusNode!, selection!.focusOffset)
    : 0;

  element.textContent = text;
  if (!selectionIsInside || !selection) return;

  const textNode =
    element.firstChild ?? element.appendChild(document.createTextNode(''));
  selection.setBaseAndExtent(
    textNode,
    Math.min(anchorOffset, text.length),
    textNode,
    Math.min(focusOffset, text.length),
  );
}

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
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
