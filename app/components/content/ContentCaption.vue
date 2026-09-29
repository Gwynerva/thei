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
// Read-only, the caption shows the owner's words with their typography. While
// it is edited it holds exactly what is stored, or every keystroke would write
// the typography back.
const shown = computed(() =>
  props.editable ? props.modelValue : publicRichText(props.modelValue),
);
// The markup the element is rendered with. While the caption is edited, what
// it reports comes straight back as `modelValue`; written in again, it would
// replace every node under the caret, and under the selection an inline link
// or hint popup is holding. So a value the element already shows is left to
// it, and only a different one is written.
const html = ref(shown.value);

// Captions are prose too, so they get the same typing shorthands as a field.
useSmartTypography(() => (props.editable ? root.value : undefined));

function sync() {
  if (!root.value) return;
  const value = normalizeContentMediaCaption(root.value.innerHTML);
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
  // An emptied caption drops the `<br>` a browser leaves behind, so that its
  // placeholder shows again. Anything else stays as it is: the blur may be a
  // link popup taking the focus, with the selection it will wrap in here.
  if (!value && root.value.innerHTML) root.value.innerHTML = '';
  if (value !== props.modelValue) emit('update:modelValue', value);
}

watch(shown, (value) => {
  const element = root.value;
  if (
    props.editable &&
    element &&
    normalizeContentMediaCaption(element.innerHTML) === value
  )
    return;
  html.value = value;
  if (element && element.innerHTML !== value) element.innerHTML = value;
});

// An inline tool writes its link or hint straight into the element, with no
// input event to tell of it, and the caption keeps the focus: without this it
// would be reported only on the next blur, and a save before that would
// leave it out. What the link decorator adds at runtime normalizes away.
let observer: MutationObserver | undefined;
watch(
  () => (props.editable ? root.value : undefined),
  (element) => {
    observer?.disconnect();
    observer = undefined;
    if (!element) return;
    observer = new MutationObserver(sync);
    observer.observe(element, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  },
  { immediate: true },
);
onBeforeUnmount(() => observer?.disconnect());
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
    v-html="html"
    @input="sync"
    @keydown="onKeydown"
    @beforeinput="onBeforeInput"
    @paste="onPaste"
    @blur="onBlur"
  />
</template>
