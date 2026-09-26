<script lang="ts" setup>
import type {
  ContentHintControlsExpose,
  ContentHintRequest,
} from './editor-inline-links';

/**
 * The popup behind the inline hint tool: one field for the explanation,
 * laid out like the link popup's rows. The field grows with the text, and
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
    max-width="20rem"
    :teleport-to="teleportTo"
    @opened="field?.focus({ preventScroll: true })"
    @dismiss="request?.restore()"
    @closed="popupClosed"
  >
    <form
      class="flex flex-col gap-xs rounded-normal border border-border-1 bg-bg-2
        p-xs"
      @submit.prevent="submit"
    >
      <FieldTextarea
        v-model="text"
        class="max-h-40 min-h-9 py-1 text-sm"
        spellcheck="true"
        :placeholder="phrase.content_hint_placeholder"
        :aria-label="phrase.content_hint"
        @element="field = $event"
        @keydown.enter.exact.prevent="submit"
      />
      <div class="flex justify-end gap-1">
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
