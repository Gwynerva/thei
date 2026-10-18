<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import { typedLines } from '#layers/thei/shared/ai-message-text';

/**
 * The one comment field of the AI pages: to an action, to a part of an
 * edit, or the owner's own answer to a question. It says what it is about,
 * offers two quick answers to an action, and grows with
 * its words up to a height of its own; the send button sits inside it and
 * wakes up when there is something to send. Enter sends, Shift+Enter breaks
 * the line; on a touch screen Enter breaks it and the button sends.
 */
const props = defineProps<{
  about?: string;
  aboutIcon?: IconName;
  /** Ready answers to send at a tap; an action's two by default. */
  quick?: readonly string[];
  placeholder?: string;
}>();
const emit = defineEmits<{ send: [text: string] }>();

const text = ref('');
const area = ref<HTMLTextAreaElement>();

/** The field grows with its words; past its height it scrolls. */
function grow() {
  const element = area.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
  element.style.overflowY =
    element.scrollHeight > element.clientHeight + 1 ? 'auto' : 'hidden';
}

function send(value = text.value) {
  const words = typedLines(value);
  if (!words) return;
  emit('send', words);
}

function keydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  // A phone's keyboard has no Shift to hold: its Enter starts a line.
  if (matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault();
  send();
}

onMounted(() => {
  grow();
  // On a touch screen the keyboard would come up over the ready answers,
  // which are what a finger takes most: there the field waits for a tap.
  const answers = (props.quick ?? phrase.value.ai_comment_quick).length;
  if (!answers || !matchMedia('(pointer: coarse)').matches) area.value?.focus();
});
defineExpose({ focus: () => area.value?.focus() });
</script>

<template>
  <div class="flex w-full flex-col gap-xs p-xs" data-comment-box>
    <p v-if="about" class="flex min-w-0 items-center gap-1 text-xs text-text-2">
      <Icon :name="aboutIcon ?? 'comment'" class="shrink-0" />
      <span class="truncate">{{ about }}</span>
    </p>
    <div
      v-if="(quick ?? phrase.ai_comment_quick).length"
      class="flex flex-wrap gap-1"
    >
      <button
        v-for="answer in quick ?? phrase.ai_comment_quick"
        :key="answer"
        type="button"
        class="cursor-pointer rounded-full border border-border-2 bg-bg-1 px-2.5
          py-1 text-xs text-text-1 transition pointer-coarse:min-h-11
          hocus:border-accent hocus:text-accent"
        @click="send(answer)"
      >
        {{ answer }}
      </button>
    </div>
    <div
      class="flex items-end gap-1 rounded-normal border border-border-2 bg-bg-1
        p-1 focus-within:border-accent"
    >
      <textarea
        ref="area"
        v-model="text"
        rows="1"
        class="scrollbar-hover max-h-40 min-h-8 min-w-0 flex-1 resize-none
          overflow-hidden bg-transparent px-1.5 py-1 text-sm leading-snug
          outline-none pointer-coarse:min-h-10 pointer-coarse:py-2"
        :aria-label="phrase.ai_comment_label"
        :placeholder="placeholder ?? phrase.ai_comment_placeholder"
        data-comment-field
        @input="grow"
        @keydown="keydown"
      ></textarea>
      <!-- An icon alone, in the accent, as in a session's composer. -->
      <button
        type="button"
        class="flex size-8 shrink-0 cursor-pointer items-center justify-center
          bg-transparent text-lg text-accent transition-opacity
          disabled:cursor-default disabled:text-text-3 disabled:opacity-100
          pointer-coarse:size-11 hocus:opacity-75"
        :disabled="!text.trim()"
        :aria-label="phrase.ai_send"
        :data-title-popup="phrase.ai_send"
        data-comment-send
        @click="send()"
      >
        <Icon name="send" />
      </button>
    </div>
  </div>
</template>
