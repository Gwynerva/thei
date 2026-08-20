<script lang="ts" setup>
import { normalizeContentMediaCaption } from '#layers/thei/shared/content';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    editable?: boolean;
    placeholder?: string;
    centered?: boolean;
  }>(),
  {
    modelValue: '',
    editable: false,
    placeholder: '',
    centered: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
const root = useTemplateRef<HTMLElement>('root');

function sync() {
  const value = normalizeContentMediaCaption(root.value?.innerHTML);
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
}

function onBeforeInput(event: InputEvent) {
  if (
    event.inputType === 'insertParagraph' ||
    event.inputType === 'insertLineBreak'
  ) {
    event.preventDefault();
  }
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  const text = event.clipboardData
    ?.getData('text/plain')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (text) document.execCommand('insertText', false, text);
}

function onBlur() {
  if (!root.value) return;
  const value = normalizeContentMediaCaption(root.value.innerHTML);
  if (root.value.innerHTML !== value) root.value.innerHTML = value;
  if (value !== props.modelValue) emit('update:modelValue', value);
}

watch(
  () => props.modelValue,
  (value) => {
    if (!root.value || document.activeElement === root.value) return;
    if (root.value.innerHTML !== value) root.value.innerHTML = value;
  },
);
</script>

<template>
  <div
    v-if="editable || modelValue"
    ref="root"
    class="mt-xs min-h-6 w-full text-sm text-text-2 outline-none
      empty:before:pointer-events-none empty:before:text-text-3
      empty:before:content-[attr(data-placeholder)] focus:before:hidden"
    :class="{ 'text-center': centered }"
    :contenteditable="editable"
    :spellcheck="editable"
    :role="editable ? 'textbox' : undefined"
    :aria-label="editable ? placeholder : undefined"
    :aria-multiline="editable ? 'false' : undefined"
    :data-placeholder="placeholder"
    v-html="modelValue"
    @input="sync"
    @keydown="onKeydown"
    @beforeinput="onBeforeInput"
    @paste="onPaste"
    @blur="onBlur"
  />
</template>
