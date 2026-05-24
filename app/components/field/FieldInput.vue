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
  wrapperClass?: string;
}>();

const model = defineModel<string>();

const emit = defineEmits<{
  element: [HTMLInputElement];
  submit: [];
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
  <div :class="wrapperClass">
    <input
      v-bind="attrs"
      ref="input"
      v-model="model"
      data-label-focus
      class="w-full min-w-[160px] border-2 bg-bg-1 p-xs text-text-1 transition
        placeholder:text-text-3 focus:border-border-3 hocus:border-border-3"
      :class="[
        shownError
          ? 'rounded-t-lg border-border-error'
          : 'rounded-normal border-border-1',
      ]"
      @focus="onFocus"
      @blur="onBlur"
      @keyup.enter.prevent="$emit('submit')"
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
