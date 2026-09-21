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

const { required, error, noTypography } = defineProps<{
  required?: boolean;
  error?: ErrorProp;
  wrapperClass?: string;
  noTypography?: boolean;
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

/**
 * Smart typography follows the spellcheck flag: a field marked as prose gets
 * dashes and ellipses as it is typed, a field marked technical — a slug, a
 * URL, a colour, a token — is left exactly as typed. `noTypography` turns it
 * off for a prose field that is an exception.
 *
 * The opt-out is a flag rather than a three-state override on purpose: Vue
 * gives an absent boolean prop the value `false`, never `undefined`, so an
 * override could not tell "not set" from "set to off".
 */
const typographyEnabled = computed(
  () =>
    !noTypography && attrs.spellcheck !== 'false' && attrs.spellcheck !== false,
);
useSmartTypography(() =>
  typographyEnabled.value ? inputElement.value : undefined,
);

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
      class="w-full min-w-40 border-2 bg-bg-1 p-xs text-text-1 transition
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
