<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

const { required } = defineProps<{
  required?: boolean;
}>();

const model = defineModel<string>();

const touched = ref(false);
const focused = ref(false);

const shownError = computed<string | false>(() => {
  if (!touched.value || focused.value) {
    return false;
  }

  if (required && !model.value?.trim()) {
    return phrase.value.this_field_must_be_filled;
  }

  return false;
});

function onFocus() {
  focused.value = true;
}

function onBlur() {
  focused.value = false;
  touched.value = true;
}

const textarea = useTemplateRef('textarea');
let resizeObserver: ResizeObserver | undefined;
let resizeFrame: number | undefined;
let observedWidth = 0;

const placeholder = computed(() =>
  typeof attrs.placeholder === 'string' ? attrs.placeholder : '',
);

function resize() {
  const el = textarea.value;
  if (!el) {
    return;
  }

  const measurePlaceholder = !model.value && placeholder.value;
  const value = el.value;
  if (measurePlaceholder) {
    el.value = placeholder.value;
  }

  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;

  if (measurePlaceholder) {
    el.value = value;
  }
}

function scheduleResize() {
  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }

  void nextTick(() => {
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      resize();
    });
  });
}

watch(model, scheduleResize, { flush: 'post' });
watch(placeholder, scheduleResize, { flush: 'post' });
onMounted(() => {
  scheduleResize();

  const el = textarea.value;
  if (!el || typeof ResizeObserver === 'undefined') return;

  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (width === observedWidth) return;
    observedWidth = width;
    scheduleResize();
  });
  resizeObserver.observe(el);
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  if (resizeFrame !== undefined) {
    cancelAnimationFrame(resizeFrame);
  }
});
</script>

<template>
  <div>
    <textarea
      v-bind="attrs"
      ref="textarea"
      v-model="model"
      data-label-focus
      rows="1"
      class="block w-full min-w-40 resize-none overflow-hidden border-2 bg-bg-1
        p-xs text-text-1 transition placeholder:text-text-3
        focus:border-border-3 hocus:border-border-3"
      :class="[
        shownError
          ? 'rounded-t-lg border-border-error'
          : 'rounded-normal border-border-1',
      ]"
      @focus="onFocus"
      @blur="onBlur"
    />

    <div
      v-if="shownError"
      class="rounded-b-lg border-2 border-t-0 border-border-error bg-bg-error
        p-xs text-sm text-text-error"
    >
      <Icon name="warning" class="mr-xs" />
      <span>{{ shownError }}</span>
    </div>
  </div>
</template>
