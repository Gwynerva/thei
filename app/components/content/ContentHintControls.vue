<script lang="ts" setup>
import type {
  ContentHintControlsExpose,
  ContentHintRequest,
} from './editor-inline-links';

/**
 * The popup behind the inline hint tool.
 *
 * It is deliberately the same shape as the link popup: one floating panel
 * anchored to the inline toolbar, opened through the editor's popover layer so
 * the modal's overflow cannot clip it. The field grows with the text and
 * `FloatingPopup` watches the panel's own size, so a hint of several lines
 * pushes the panel around rather than out of view.
 */
defineProps<{ teleportTo?: string | HTMLElement }>();

const open = ref(false);
const request = shallowRef<ContentHintRequest>();
const text = ref('');
const field = ref<HTMLTextAreaElement>();

function openControls(next: ContentHintRequest) {
  request.value = next;
  text.value = next.initialText;
  open.value = true;
}

function submit() {
  request.value?.apply(text.value);
  open.value = false;
}

function remove() {
  request.value?.remove();
  open.value = false;
}

function popupClosed() {
  request.value?.restore();
  request.value = undefined;
  text.value = '';
}

defineExpose<ContentHintControlsExpose>({ open: openControls });
</script>

<template>
  <FloatingPopup
    v-model:open="open"
    :anchor="request?.anchor ?? null"
    placement="bottom-start"
    :fallback-placements="['top-start']"
    :offset="0"
    shift-cross-axis
    max-width="22rem"
    :teleport-to="teleportTo"
    class="border border-border-1 bg-bg-2"
    @opened="field?.focus({ preventScroll: true })"
    @closed="popupClosed"
  >
    <form
      class="flex w-75 max-w-full flex-col gap-xs p-xs"
      @submit.prevent="submit"
    >
      <FieldTextarea
        v-model="text"
        class="max-h-40 text-sm"
        spellcheck="true"
        :placeholder="phrase.content_hint_placeholder"
        :aria-label="phrase.content_hint"
        @element="field = $event"
      />
      <div class="flex items-center justify-end gap-1">
        <Button
          v-if="request?.existing"
          type="button"
          variant="delete"
          size="icon"
          :aria-label="phrase.content_hint_remove"
          @click="remove"
        >
          <Icon name="delete" />
        </Button>
        <Button type="submit" size="icon" :aria-label="phrase.content_hint">
          <Icon name="check" />
        </Button>
      </div>
    </form>
  </FloatingPopup>
</template>
