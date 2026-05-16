<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

type ErrorProp =
  | string
  | boolean
  | {
      message: string;
      hard?: boolean;
    };

const { required, error } = defineProps<{
  required?: boolean;
  error?: ErrorProp;
}>();

const model = defineModel<string>();

const emit = defineEmits<{
  element: [HTMLInputElement];
}>();

const inputElement = useTemplateRef('input');

watch(inputElement, (newElement) => {
  if (!newElement) {
    return;
  }

  emit('element', newElement);
});

const touched = ref(false);
const focused = ref(false);

const shownError = computed<string | false>(() => {
  const hardError = typeof error === 'object' && error?.hard && error.message;

  // Hard errors bypass touched/focused logic
  if (hardError) {
    return error.message;
  }

  // Normal validation visibility rules
  if (!touched.value || focused.value) {
    return false;
  }

  // External soft error
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error?.message) {
    return error.message;
  }

  // Internal required validation
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
</script>

<template>
  <div>
    <input
      v-bind="attrs"
      ref="input"
      v-model="model"
      class="w-full min-w-[160px] border-2 bg-bg-1 p-xs text-text-1 transition
        focus:border-border-3 hactive:border-border-3"
      :class="[
        shownError
          ? 'rounded-t-lg border-border-error'
          : 'rounded-lg border-border-1',
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
