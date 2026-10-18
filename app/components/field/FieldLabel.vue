<script lang="ts" setup>
const props = defineProps<{
  required?: boolean;
  onActivate?: (element: HTMLElement) => void;
}>();

const root = useTemplateRef('root');
/** What an AI proposes for the field: the label turns accent, with a ✦. */
const { place, offered } = useFieldOffers('label');

function handleClick() {
  const target = root.value
    ?.closest('[data-field]')
    ?.querySelector<HTMLElement>('[data-label-focus]');

  if (!target) {
    return;
  }

  if (props.onActivate) {
    props.onActivate(target);
  } else {
    target.focus();
  }
}
</script>

<template>
  <div
    ref="root"
    class="cursor-pointer font-semibold tracking-tight transition-colors"
    data-field-label
    :class="offered ? 'text-accent' : ''"
    @click="handleClick"
  >
    <slot></slot
    ><span
      v-if="required"
      class="relative -top-1 -right-1.5 text-xs text-accent"
      data-field-label-extra
      >*</span
    ><AiFieldOffer
      v-if="place"
      :place
      :class="required ? 'ml-3' : 'ml-1.5'"
      data-field-label-extra
    />
  </div>
</template>
